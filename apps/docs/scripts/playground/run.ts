import {
  type CreateProvider,
  createDefaultRegistry,
  type LocaleSummary,
  loadConfig,
  type ProgressListener,
  type RunSummary,
  translate,
} from "@verbatra/sdk";
import { ZodError, z } from "zod";
import type { PlaygroundOutput } from "../../lib/playground/schema.ts";
import { type Budget, createBudget } from "./budget.ts";
import { PlaygroundRefusal } from "./guards.ts";
import { ATTEMPT_CAP, MAX_OUTPUT_TOKENS, MODEL, SOURCE_LOCALE } from "./limits.ts";
import { createMemoryStore, type MemoryStore } from "./memory-fs.ts";
import { buildOutput } from "./output.ts";
import { estimateRequests, type PlaygroundPlan, planPairs } from "./plan.ts";
import type { SourceItem } from "./source.ts";

export const PLAYGROUND_ROOT = "/verbatra-playground";

export interface RunRequest {
  readonly items: readonly SourceItem[];
  readonly languages: readonly string[];
  readonly existing: PlaygroundOutput | undefined;
  readonly sdkVersion: string;
  readonly now: () => Date;
  readonly createProvider?: CreateProvider;
  readonly attemptCap?: number;
}

export interface DryRunReport {
  readonly kind: "dry-run";
  readonly plan: PlaygroundPlan;
  readonly plannedRequests: number;
  readonly sdkRequests: number | undefined;
  readonly sdkKeys: number | undefined;
}

export type WriteOutcome =
  | { readonly kind: "nothing-to-do"; readonly plan: PlaygroundPlan }
  | { readonly kind: "stopped"; readonly reason: string; readonly attempts: number }
  | {
      readonly kind: "provider-failed";
      readonly messages: readonly string[];
      readonly attempts: number;
    }
  | { readonly kind: "rejected"; readonly problems: readonly string[]; readonly attempts: number }
  | { readonly kind: "ready"; readonly output: PlaygroundOutput; readonly attempts: number };

export const refuseProvider: CreateProvider = () => {
  throw new PlaygroundRefusal("A dry run must never construct a provider.");
};

function messagesPath(locale: string): string {
  return `${PLAYGROUND_ROOT}/messages/${locale}.json`;
}

export function configOverride(languages: readonly string[]) {
  return {
    sourceLocale: SOURCE_LOCALE,
    targetLocales: [...languages],
    format: "next-intl-json",
    files: { pattern: "messages/{locale}.json" },
    provider: { id: "gemini", options: { model: MODEL, maxOutputTokens: MAX_OUTPUT_TOKENS } },
  };
}

function seedStore(items: readonly SourceItem[], plan: PlaygroundPlan): MemoryStore {
  const files: Record<string, string> = {
    [messagesPath(SOURCE_LOCALE)]: JSON.stringify(
      Object.fromEntries(items.map((item) => [item.id, item.text])),
    ),
  };
  for (const [language, kept] of Object.entries(plan.kept)) {
    if (Object.keys(kept).length > 0) {
      files[messagesPath(language)] = JSON.stringify(kept);
    }
  }
  return createMemoryStore(files);
}

async function runSdk(
  request: RunRequest,
  store: MemoryStore,
  options: {
    readonly estimate: boolean;
    readonly createProvider: CreateProvider | undefined;
    readonly onProgress?: ProgressListener;
    readonly signal?: AbortSignal;
  },
): Promise<RunSummary> {
  const config = await loadConfig({
    configOverride: configOverride(request.languages),
    cwd: PLAYGROUND_ROOT,
    fs: store.sdkFs,
  });
  return translate(
    {
      config,
      cwd: PLAYGROUND_ROOT,
      cache: false,
      concurrency: 1,
      generatePlurals: false,
      ...(options.estimate ? { estimate: true, dryRun: true } : {}),
      ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
      ...(options.signal === undefined ? {} : { signal: options.signal }),
    },
    {
      fs: store.sdkFs,
      adapterRegistry: createDefaultRegistry(store.adapterFs),
      ...(options.createProvider === undefined ? {} : { createProvider: options.createProvider }),
    },
  );
}

export async function dryRun(request: RunRequest): Promise<DryRunReport> {
  const plan = planPairs(request.items, request.languages, request.existing);
  const plannedRequests = estimateRequests(plan);
  if (plan.pairs.length === 0) {
    return { kind: "dry-run", plan, plannedRequests, sdkRequests: 0, sdkKeys: 0 };
  }
  const summary = await runSdk(request, seedStore(request.items, plan), {
    estimate: true,
    createProvider: request.createProvider ?? refuseProvider,
  });
  return {
    kind: "dry-run",
    plan,
    plannedRequests,
    sdkRequests: summary.estimate?.requests,
    sdkKeys: summary.estimate?.keys,
  };
}

function localeProblems(locale: LocaleSummary): string[] {
  const lists: ReadonlyArray<readonly [readonly string[], string]> = [
    [locale.providerFailures, "provider failure"],
    [locale.integrityMismatches, "placeholder integrity mismatch"],
    [locale.budgetWithheld, "withheld by the token budget"],
  ];
  const problems = lists.flatMap(([keys, label]) =>
    keys.map((key) => `${locale.locale}.${key}: ${label}`),
  );
  if (locale.status !== "succeeded") {
    problems.push(`${locale.locale}: locale status ${locale.status}`);
  }
  return problems;
}

export function summaryProblems(summary: RunSummary): string[] {
  const problems = summary.locales.flatMap(localeProblems);
  if (summary.cancelled === true) {
    problems.unshift("the run was cancelled");
  }
  return problems;
}

const translatedFileSchema = z.record(z.string(), z.string());

function readTranslations(
  store: MemoryStore,
  languages: readonly string[],
): Record<string, Record<string, string>> {
  const result: Record<string, Record<string, string>> = {};
  for (const language of languages) {
    const raw = store.files.get(messagesPath(language));
    result[language] = raw === undefined ? {} : translatedFileSchema.parse(JSON.parse(raw));
  }
  return result;
}

function providerFailureMessages(summary: RunSummary): string[] {
  return summary.locales
    .filter((locale) => locale.providerFailures.length > 0)
    .flatMap((locale) =>
      locale.notices
        .filter((notice) => notice.code === "SUB_BATCH_FAILED")
        .map((notice) => `${locale.locale}: ${notice.message}`),
    );
}

function classifyRun(summary: RunSummary, budget: Budget): WriteOutcome | undefined {
  const attempts = budget.attempts();
  const stop = budget.stopReason();
  if (stop === "rate-limited" || stop === "attempt-cap") {
    return { kind: "stopped", reason: stop, attempts };
  }
  const failures = providerFailureMessages(summary);
  if (failures.length > 0) {
    return { kind: "provider-failed", messages: failures, attempts };
  }
  const problems = summaryProblems(summary);
  if (problems.length > 0) {
    return { kind: "rejected", problems, attempts };
  }
  if (budget.controller.signal.aborted) {
    return { kind: "stopped", reason: stop ?? "cancelled", attempts };
  }
  return undefined;
}

function validationProblems(error: unknown): readonly string[] {
  if (error instanceof ZodError) {
    return error.issues.map((issue) => issue.message);
  }
  throw error;
}

export async function translateForWrite(request: RunRequest): Promise<WriteOutcome> {
  const plan = planPairs(request.items, request.languages, request.existing);
  if (plan.pairs.length === 0) {
    return { kind: "nothing-to-do", plan };
  }
  const store = seedStore(request.items, plan);
  const budget = createBudget(request.attemptCap ?? ATTEMPT_CAP);
  const summary = await runSdk(request, store, {
    estimate: false,
    createProvider: request.createProvider,
    onProgress: budget.onProgress,
    signal: budget.controller.signal,
  });
  const failed = classifyRun(summary, budget);
  if (failed !== undefined) {
    return failed;
  }
  try {
    const output = buildOutput({
      items: request.items,
      languages: request.languages,
      translations: readTranslations(store, request.languages),
      sdkVersion: request.sdkVersion,
      generatedAt: request.now(),
    });
    return { kind: "ready", output, attempts: budget.attempts() };
  } catch (error) {
    return { kind: "rejected", problems: validationProblems(error), attempts: budget.attempts() };
  }
}
