import type { CreateProvider } from "@verbatra/sdk";
import type { PlaygroundOutput } from "../../lib/playground/schema.ts";
import {
  assertInputLimits,
  assertLanguagesAllowed,
  assertNoSensitiveData,
  assertSafeEnvironment,
  bridgePlaygroundKey,
  type Environment,
  PlaygroundRefusal,
  redactForOutput,
} from "./guards.ts";
import { ATTEMPT_CAP, MAX_OUTPUT_TOKENS, MODEL } from "./limits.ts";
import { serializeOutput } from "./output.ts";
import { type PlaygroundPlan, planPairs } from "./plan.ts";
import { type DryRunReport, dryRun, translateForWrite, type WriteOutcome } from "./run.ts";
import type { SourceItem } from "./source.ts";

export type Mode = "dry-run" | "write";

export interface CliDeps {
  readonly argv: readonly string[];
  readonly env: Environment;
  readonly isTTY: boolean;
  readonly insideContainer: boolean;
  readonly items: readonly SourceItem[];
  readonly languages: readonly string[];
  readonly sdkVersion: string;
  readonly outputLabel: string;
  readonly now: () => Date;
  readonly out: (line: string) => void;
  readonly err: (line: string) => void;
  readonly readExisting: () => Promise<PlaygroundOutput | undefined>;
  readonly writeOutput: (data: string) => Promise<void>;
  readonly createProvider?: CreateProvider;
}

export function parseMode(argv: readonly string[]): Mode {
  if (argv.length === 0) {
    return "dry-run";
  }
  if (argv.length === 1 && argv[0] === "--write") {
    return "write";
  }
  throw new PlaygroundRefusal(
    "The only accepted argument is --write. Nothing else is configurable.",
  );
}

function printPlan(deps: CliDeps, plan: PlaygroundPlan): void {
  deps.out("Items:");
  for (const item of deps.items) {
    deps.out(
      `  ${item.id}: ${JSON.stringify(item.text)}${item.sameAllowed === true ? " (may stay the same)" : ""}`,
    );
  }
  deps.out(`Languages: ${deps.languages.join(", ")}`);
  deps.out(
    `Provider: gemini, model ${MODEL}, maxOutputTokens ${MAX_OUTPUT_TOKENS}, temperature provider default`,
  );
  deps.out(`Attempt cap: ${ATTEMPT_CAP} (aborts on the first provider retry with status 429)`);
  if (plan.pairs.length === 0) {
    deps.out("Planned pairs: none, every item and language is already in the committed JSON.");
    return;
  }
  deps.out(`Planned pairs (${plan.pairs.length}):`);
  for (const pair of plan.pairs) {
    deps.out(`  ${pair.language}.${pair.id} (${pair.reason})`);
  }
}

function printDryRun(deps: CliDeps, report: DryRunReport): void {
  printPlan(deps, report.plan);
  deps.out(`Estimated requests (one per language batch): ${report.plannedRequests}`);
  deps.out(
    `SDK estimate: ${report.sdkRequests ?? "unavailable"} requests for ${report.sdkKeys ?? "unavailable"} keys, before any repair round or retry`,
  );
  deps.out("Dry run: nothing was sent and nothing was written. Pass --write to send.");
}

async function finishWrite(deps: CliDeps, outcome: WriteOutcome): Promise<number> {
  switch (outcome.kind) {
    case "nothing-to-do":
      deps.out("Nothing to translate. The committed JSON is unchanged.");
      return 0;
    case "stopped":
      deps.err(
        `Stopped (${outcome.reason}) after ${outcome.attempts} counted attempts. Nothing was written; the existing JSON is unchanged.`,
      );
      return 1;
    case "provider-failed":
      deps.err(
        `The provider failed after ${outcome.attempts} counted attempts; the run was aborted. Nothing was written:`,
      );
      for (const message of outcome.messages) {
        deps.err(`  ${redactForOutput(message, deps.env)}`);
      }
      return 1;
    case "rejected":
      deps.err("The run produced output that failed validation. Nothing was written:");
      for (const problem of outcome.problems) {
        deps.err(`  ${redactForOutput(problem, deps.env)}`);
      }
      return 1;
    case "ready":
      await deps.writeOutput(serializeOutput(outcome.output));
      deps.out(`Wrote ${deps.outputLabel} after ${outcome.attempts} counted attempts.`);
      deps.out(`Review before committing: git diff -- ${deps.outputLabel}`);
      return 0;
  }
}

async function execute(deps: CliDeps): Promise<number> {
  const mode = parseMode(deps.argv);
  assertSafeEnvironment({
    env: deps.env,
    isTTY: deps.isTTY,
    insideContainer: deps.insideContainer,
  });
  assertNoSensitiveData(deps.items);
  assertInputLimits(deps.items);
  assertLanguagesAllowed(deps.languages);
  const request = {
    items: deps.items,
    languages: deps.languages,
    existing: await deps.readExisting(),
    sdkVersion: deps.sdkVersion,
    now: deps.now,
    ...(deps.createProvider === undefined ? {} : { createProvider: deps.createProvider }),
  };
  if (mode === "dry-run") {
    printDryRun(deps, await dryRun(request));
    return 0;
  }
  bridgePlaygroundKey(deps.env);
  printPlan(deps, planPairs(deps.items, deps.languages, request.existing));
  return finishWrite(deps, await translateForWrite(request));
}

export async function main(deps: CliDeps): Promise<number> {
  try {
    return await execute(deps);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    deps.err(redactForOutput(message, deps.env));
    return error instanceof PlaygroundRefusal ? 2 : 1;
  }
}
