import { type JsonEnvelope, parseNdjsonEnvelopes } from "./harness.js";

export interface RunNotice {
  readonly code: string;
  readonly message: string;
}

export interface RunLocaleSummary {
  readonly locale: string;
  readonly status?: "succeeded" | "partial" | "failed";
  readonly translated?: readonly string[];
  readonly unchanged?: readonly string[];
  readonly cacheHits?: readonly string[];
  readonly fuzzyHits?: ReadonlyArray<{ readonly key: string }>;
  readonly generated?: readonly string[];
  readonly providerFailures?: readonly string[];
  readonly integrityMismatches?: readonly string[];
  readonly budgetWithheld?: readonly string[];
  readonly notices?: readonly RunNotice[];
  readonly error?: RunNotice;
}

export interface RunSummary {
  readonly locales?: readonly RunLocaleSummary[];
}

export interface RunTarget {
  readonly locale: string;
  readonly key: string;
}

export type KeyOutcome =
  | { readonly kind: "delivered" }
  | { readonly kind: "throttled"; readonly detail: string }
  | { readonly kind: "failed"; readonly detail: string }
  | { readonly kind: "pending" };

export type SettledKeyOutcome = Exclude<KeyOutcome, { readonly kind: "pending" }>;

const TRANSIENT_PROVIDER_CODES: ReadonlySet<string> = new Set([
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "TIMEOUT",
]);

const SUB_BATCH_FAILURE_CODE_PATTERN = /^A sub-batch of \d+ (?:entry|entries) failed \(([A-Z_]+):/;

const WITHHELD_SUB_BATCH_CODE = "SUB_BATCH_FAILED";

const CLEAN_EXIT_CODE = 0;

const UNCLEAN_EXIT_CODE = 1;

function acceptedKeys(summary: RunLocaleSummary): readonly string[] {
  return [
    ...(summary.translated ?? []),
    ...(summary.unchanged ?? []),
    ...(summary.cacheHits ?? []),
    ...(summary.fuzzyHits ?? []).map((hit) => hit.key),
    ...(summary.generated ?? []),
  ];
}

function describeNotices(summary: RunLocaleSummary): string {
  return (summary.notices ?? []).map((notice) => `${notice.code}: ${notice.message}`).join("; ");
}

function isTransientSubBatchFailure(notice: RunNotice): boolean {
  const code = SUB_BATCH_FAILURE_CODE_PATTERN.exec(notice.message)?.[1];
  return code !== undefined && TRANSIENT_PROVIDER_CODES.has(code);
}

function unrelatedWithholdingDetail(summary: RunLocaleSummary): string | undefined {
  const integrity = summary.integrityMismatches ?? [];
  if (integrity.length > 0) {
    return `keys that failed the placeholder-integrity gate (${integrity.join(", ")})`;
  }
  const budget = summary.budgetWithheld ?? [];
  if (budget.length > 0) {
    return `keys withheld by the token budget (${budget.join(", ")})`;
  }
  return undefined;
}

function throttledUnlessUnrelatedFailure(summary: RunLocaleSummary, detail: string): KeyOutcome {
  const unrelated = unrelatedWithholdingDetail(summary);
  return unrelated === undefined
    ? { kind: "throttled", detail }
    : { kind: "failed", detail: `${detail} The same run also reported ${unrelated}.` };
}

function classifyWithheldKey(summary: RunLocaleSummary, key: string): KeyOutcome {
  const subBatchFailures = (summary.notices ?? []).filter(
    (notice) => notice.code === WITHHELD_SUB_BATCH_CODE,
  );
  const [firstFailure] = subBatchFailures;
  if (firstFailure !== undefined && subBatchFailures.every(isTransientSubBatchFailure)) {
    return throttledUnlessUnrelatedFailure(summary, firstFailure.message);
  }
  const notices = describeNotices(summary);
  const cause = notices.length > 0 ? ` (${notices})` : " with no notice explaining why";
  return { kind: "failed", detail: `"${key}" was withheld${cause}` };
}

function classifyLocaleError(summary: RunLocaleSummary, error: RunNotice): KeyOutcome {
  const detail = `locale "${summary.locale}" failed (${error.code}: ${error.message})`;
  return TRANSIENT_PROVIDER_CODES.has(error.code)
    ? throttledUnlessUnrelatedFailure(summary, detail)
    : { kind: "failed", detail };
}

function classifyLocaleSummary(summary: RunLocaleSummary, key: string): KeyOutcome {
  const error = summary.error;
  if (error !== undefined) {
    return classifyLocaleError(summary, error);
  }
  if (acceptedKeys(summary).includes(key)) {
    return { kind: "delivered" };
  }
  if ((summary.providerFailures ?? []).includes(key)) {
    return classifyWithheldKey(summary, key);
  }
  if ((summary.integrityMismatches ?? []).includes(key)) {
    return { kind: "failed", detail: `"${key}" failed the placeholder-integrity gate` };
  }
  if ((summary.budgetWithheld ?? []).includes(key)) {
    return { kind: "failed", detail: `"${key}" was withheld by the token budget` };
  }
  return { kind: "pending" };
}

type SummaryLookup =
  | { readonly found: true; readonly summary: RunLocaleSummary }
  | { readonly found: false; readonly detail: string };

function findLocaleSummary(envelope: JsonEnvelope<RunSummary>, locale: string): SummaryLookup {
  if (!envelope.ok) {
    return { found: false, detail: `the run failed (${envelope.code}: ${envelope.message})` };
  }
  const summary = (envelope.result.locales ?? []).find((entry) => entry.locale === locale);
  if (summary === undefined) {
    return { found: false, detail: `the run reported no summary for locale "${locale}"` };
  }
  return { found: true, summary };
}

export function classifyRunEnvelope(
  envelope: JsonEnvelope<RunSummary>,
  target: RunTarget,
): KeyOutcome {
  const lookup = findLocaleSummary(envelope, target.locale);
  return lookup.found
    ? classifyLocaleSummary(lookup.summary, target.key)
    : { kind: "failed", detail: lookup.detail };
}

export type LiveRunVerdict =
  | { readonly kind: "clean" }
  | { readonly kind: "throttled"; readonly detail: string }
  | { readonly kind: "failed"; readonly detail: string };

export interface LiveRun {
  readonly exitCode: number | null;
  readonly stdout: string;
}

function verdictForSummary(summary: RunLocaleSummary, target: RunTarget): LiveRunVerdict {
  const outcome = classifyLocaleSummary(summary, target.key);
  if (outcome.kind === "failed" || outcome.kind === "throttled") {
    return outcome;
  }
  return {
    kind: "failed",
    detail: `the run exited ${UNCLEAN_EXIT_CODE} but reported no failure for "${target.key}"`,
  };
}

function lastEnvelope(stdout: string): JsonEnvelope<RunSummary> | undefined {
  try {
    const envelopes = parseNdjsonEnvelopes<RunSummary>(stdout);
    return envelopes.at(-1);
  } catch {
    return undefined;
  }
}

export function classifyLiveRun(run: LiveRun, target: RunTarget): LiveRunVerdict {
  if (run.exitCode === CLEAN_EXIT_CODE) {
    return { kind: "clean" };
  }
  if (run.exitCode !== UNCLEAN_EXIT_CODE) {
    return {
      kind: "failed",
      detail: `the run exited ${run.exitCode ?? "on a signal"}, which a transient provider fault never causes`,
    };
  }
  const envelope = lastEnvelope(run.stdout);
  if (envelope === undefined) {
    return {
      kind: "failed",
      detail: `the run exited ${UNCLEAN_EXIT_CODE} without a readable --json record on stdout`,
    };
  }
  const lookup = findLocaleSummary(envelope, target.locale);
  return lookup.found
    ? verdictForSummary(lookup.summary, target)
    : { kind: "failed", detail: lookup.detail };
}
