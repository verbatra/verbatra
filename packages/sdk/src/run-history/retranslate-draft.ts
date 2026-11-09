import type { AdapterRegistry } from "@verbatra/format-adapters";
import { projectCwd } from "../config/project-root.js";
import type { VerbatraConfig } from "../config/schema.js";
import type { UsageSummary } from "../flow/summary.js";
import { combineUsage } from "../flow/usage.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { type DraftLocale, type RunDraft, recordRunHistory } from "./record-run.js";

export interface RetranslateSpend {
  readonly locale: string;
  attempted: boolean;
  usage: UsageSummary | undefined;
  characters: number;
  outcome: "accepted" | "refused" | "failed";
}

export function newRetranslateSpend(locale: string): RetranslateSpend {
  return { locale, attempted: false, usage: undefined, characters: 0, outcome: "failed" };
}

function localeStatus(accepted: number, answered: number): DraftLocale["status"] {
  if (accepted === 0) {
    return "failed";
  }
  return accepted === answered ? "succeeded" : "partial";
}

function draftLocale(locale: string, spends: readonly RetranslateSpend[]): DraftLocale {
  const accepted = spends.filter((spend) => spend.outcome === "accepted").length;
  const usage = spends.reduce<UsageSummary | undefined>(
    (total, spend) => combineUsage(total, spend.usage),
    undefined,
  );
  return {
    locale,
    status: localeStatus(accepted, spends.length),
    translated: accepted,
    cacheHits: 0,
    fuzzyHits: 0,
    generated: 0,
    pruned: 0,
    integrityMismatches: spends.filter((spend) => spend.outcome === "refused").length,
    providerFailures: spends.filter((spend) => spend.outcome === "failed").length,
    usage,
  };
}

export async function recordRetranslations(
  input: { readonly config: VerbatraConfig; readonly cwd?: string },
  deps: { readonly fs?: SdkFs; readonly adapterRegistry?: AdapterRegistry },
  spends: readonly RetranslateSpend[],
): Promise<void> {
  const draft = draftFromSpends(spends);
  if (draft === undefined) {
    return;
  }
  await recordRunHistory(
    {
      config: input.config,
      cwd: projectCwd(input),
      fs: deps.fs ?? defaultFs,
      adapterRegistry: deps.adapterRegistry,
    },
    draft,
  );
}

export function draftFromSpends(spends: readonly RetranslateSpend[]): RunDraft | undefined {
  const attempted = spends.filter((spend) => spend.attempted);
  if (attempted.length === 0) {
    return undefined;
  }
  const byLocale = new Map<string, RetranslateSpend[]>();
  for (const spend of attempted) {
    byLocale.set(spend.locale, [...(byLocale.get(spend.locale) ?? []), spend]);
  }
  return {
    trigger: "retranslate",
    entries: attempted.length,
    locales: [...byLocale].map(([locale, group]) => draftLocale(locale, group)),
    usage: attempted.reduce<UsageSummary | undefined>(
      (total, spend) => combineUsage(total, spend.usage),
      undefined,
    ),
    sourceCharacters: attempted.reduce((total, spend) => total + spend.characters, 0),
    keysSent: true,
    usagePartial: attempted.some((spend) => spend.usage === undefined),
  };
}
