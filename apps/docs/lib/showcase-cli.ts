import type { ShowcaseOutcome } from "./showcase-scenarios";
import { SHOWCASE_TARGET_LOCALE } from "./showcase-seed";

export const SHOWCASE_CLI_COMMAND = "verbatra translate";

export const SHOWCASE_REFUSAL_REASON = "placeholder";

const WITHHELD_LABEL = "integrity-withheld";

type RunStatus = "succeeded" | "partial" | "failed";

function runStatus(outcome: ShowcaseOutcome): RunStatus {
  if (outcome.refusal === null) return "succeeded";
  return outcome.written.length > 0 ? "partial" : "failed";
}

function countLine(outcome: ShowcaseOutcome): string {
  const withheld = outcome.refusal === null ? 0 : 1;
  const counts = [
    `${outcome.written.length} translated`,
    `${outcome.unchanged.length} unchanged`,
    ...(outcome.orphaned.length > 0 ? [`${outcome.orphaned.length} orphaned`] : []),
    ...(withheld > 0 ? [`${withheld} ${WITHHELD_LABEL}`] : []),
  ];
  const failed = runStatus(outcome) === "failed" ? "failed, " : "";
  return `  ${SHOWCASE_TARGET_LOCALE}: ${failed}${counts.join(", ")}`;
}

function refusalLines(outcome: ShowcaseOutcome): ReadonlyArray<string> {
  const refusal = outcome.refusal;
  if (refusal === null) return [];
  return [
    `    ${WITHHELD_LABEL}:`,
    `      ${refusal.key}: ${SHOWCASE_REFUSAL_REASON} (${refusal.details.join(", ")})`,
  ];
}

function aggregateLine(outcome: ShowcaseOutcome): string {
  const status = runStatus(outcome);
  const count = (of: RunStatus) => (status === of ? 1 : 0);
  return `${count("succeeded")} succeeded, ${count("partial")} partial, ${count("failed")} failed`;
}

export function showcaseRunLines(outcome: ShowcaseOutcome): ReadonlyArray<string> {
  return [
    SHOWCASE_CLI_COMMAND,
    countLine(outcome),
    ...refusalLines(outcome),
    aggregateLine(outcome),
  ];
}

export type ShowcaseSavings = { readonly sent: number; readonly total: number };

export function showcaseSavings(outcome: ShowcaseOutcome): ShowcaseSavings {
  const sent = outcome.missing.length + outcome.stale.length;
  return { sent, total: sent + outcome.unchanged.length };
}
