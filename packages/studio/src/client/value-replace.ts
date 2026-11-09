import type {
  ValueReplaceLocaleFailure,
  ValueReplaceOutcome,
  ValueReplacePreview,
  ValueReplacePreviewEntry,
  ValueReplaceStatus,
} from "@verbatra/sdk";
import type {
  ApplyValueReplaceParams,
  PreviewValueReplaceParams,
} from "../shared/rpc/value-replace.js";

export interface ReplaceCriteria {
  readonly find: string;
  readonly replace: string;
  readonly caseSensitive: boolean;
  readonly locales: readonly string[];
}

export interface ReplaceOptIns {
  readonly includePinned: boolean;
  readonly includeProtected: boolean;
}

export const NO_OPT_INS: ReplaceOptIns = { includePinned: false, includeProtected: false };

export type ReplaceTone = "success" | "warning" | "danger" | "neutral" | "protected";

export const STALE_GATE_NOTICE =
  "A value whose source text changed since it was translated is still checked against the current source text, and stays out of date after the replacement.";

export const TRUNCATED_NOTICE =
  "More values matched than the 1,000 listed here. Only the listed values can be replaced in this run: narrow the search by locale or text, or apply this run and search again.";

export const BASELINE_UNAVAILABLE_NOTICE =
  "verbatra.lock.json could not be read, so Studio cannot compare values with the source text they were translated from and marks none as out of date.";

export const FILE_WRITTEN_NOTICE =
  "The new values are already saved in this locale file. The lock file or the provenance record may not match them yet, so review the locale before you search again.";

export const EXCERPT_CUT_NOTICE = "Shortened to the first match.";

export const PIN_OPT_IN_LABEL = "Also change pinned keys";

export const PROTECT_OPT_IN_LABEL =
  "Also change values a person wrote, imported, or changed outside verbatra";

const STATUS_ORDER: readonly ValueReplaceStatus[] = [
  "ready",
  "stale-source",
  "gate-refused",
  "too-long",
  "pinned",
  "protected",
  "no-source-entry",
  "unchanged",
];

export const STATUS_LABEL: Readonly<Record<ValueReplaceStatus, string>> = {
  ready: "Ready",
  "stale-source": "Ready, source changed",
  "gate-refused": "Refused by the integrity gate",
  "too-long": "Too long",
  pinned: "Pinned key",
  protected: "Protected value",
  "no-source-entry": "No source text",
  unchanged: "Unchanged",
};

const STATUS_TONE: Readonly<Record<ValueReplaceStatus, ReplaceTone>> = {
  ready: "success",
  "stale-source": "warning",
  "gate-refused": "danger",
  "too-long": "danger",
  pinned: "neutral",
  protected: "protected",
  "no-source-entry": "neutral",
  unchanged: "neutral",
};

const REASON_LABEL: Readonly<Record<string, string>> = {
  placeholder: "a placeholder would change",
  markup: "inline markup would change",
  icu: "the message syntax would break",
  degenerate: "the value would be degenerate",
  empty: "the value would be empty",
};

export function reasonLabel(reason: string): string {
  return Object.hasOwn(REASON_LABEL, reason) ? (REASON_LABEL[reason] ?? reason) : reason;
}

export function statusTone(status: ValueReplaceStatus): ReplaceTone {
  return STATUS_TONE[status];
}

export interface CountRow {
  readonly status: ValueReplaceStatus;
  readonly label: string;
  readonly count: number;
}

export function countRows(preview: ValueReplacePreview): readonly CountRow[] {
  return STATUS_ORDER.map((status) => ({
    status,
    label: STATUS_LABEL[status],
    count: preview.counts[status],
  })).filter((row) => row.count > 0);
}

export function isSendable(status: ValueReplaceStatus, optIns: ReplaceOptIns): boolean {
  if (status === "ready" || status === "stale-source") {
    return true;
  }
  if (status === "pinned") {
    return optIns.includePinned;
  }
  return status === "protected" && optIns.includeProtected;
}

export function entriesToApply(
  preview: ValueReplacePreview,
  optIns: ReplaceOptIns,
): readonly ValueReplacePreviewEntry[] {
  return preview.entries.filter((entry) => isSendable(entry.status, optIns));
}

function criteriaParams(criteria: ReplaceCriteria): {
  readonly find: string;
  readonly replace: string;
  readonly caseSensitive: boolean;
} {
  return {
    find: criteria.find,
    replace: criteria.replace,
    caseSensitive: criteria.caseSensitive,
  };
}

export function previewParams(
  criteria: ReplaceCriteria,
  allLocales: readonly string[],
): PreviewValueReplaceParams {
  const everyLocale = allLocales.every((locale) => criteria.locales.includes(locale));
  return {
    ...criteriaParams(criteria),
    ...(everyLocale ? {} : { locales: [...criteria.locales] }),
  };
}

export function applyParams(
  criteria: ReplaceCriteria,
  preview: ValueReplacePreview,
  optIns: ReplaceOptIns,
): ApplyValueReplaceParams | null {
  const entries = entriesToApply(preview, optIns).map((entry) => ({
    locale: entry.locale,
    key: entry.key,
    valueHash: entry.valueHash,
  }));
  if (entries.length === 0) {
    return null;
  }
  return {
    ...criteriaParams(criteria),
    entries,
    ...(optIns.includePinned ? { includePinned: true } : {}),
    ...(optIns.includeProtected ? { includeProtected: true } : {}),
  };
}

export interface OutcomeView {
  readonly label: string;
  readonly tone: ReplaceTone;
  readonly details: readonly string[];
}

const SKIP_LABEL: Readonly<Record<string, string>> = {
  pinned: "Skipped: pinned key",
  protected: "Skipped: protected value",
  "no-source-entry": "Skipped: no source text to check against",
  unchanged: "Skipped: the value would not change",
  "duplicate-entry": "Skipped: listed twice",
  "locale-failed": "Not attempted: the locale failed",
};

export function outcomeView(outcome: ValueReplaceOutcome): OutcomeView {
  switch (outcome.status) {
    case "applied":
      return {
        label: outcome.staleSource ? "Replaced, still out of date" : "Replaced",
        tone: "success",
        details: [],
      };
    case "skipped":
      return {
        label: SKIP_LABEL[outcome.reason] ?? `Skipped: ${outcome.reason}`,
        tone: outcome.reason === "locale-failed" ? "danger" : "neutral",
        details: [],
      };
    case "refused":
      return {
        label: `Refused: ${reasonLabel(outcome.reason)}`,
        tone: "danger",
        details: outcome.details ?? [],
      };
    case "changed":
      return {
        label: "Not changed: the value changed since the preview",
        tone: "warning",
        details: [],
      };
    case "too-long":
      return {
        label: "Not changed: the new value would be over 20,000 characters",
        tone: "danger",
        details: [],
      };
  }
}

export interface OutcomeRow {
  readonly locale: string;
  readonly key: string;
  readonly view: OutcomeView;
}

export function outcomeRows(outcomes: readonly ValueReplaceOutcome[]): readonly OutcomeRow[] {
  return outcomes.map((outcome) => ({
    locale: outcome.locale,
    key: outcome.key,
    view: outcomeView(outcome),
  }));
}

export interface FailureView {
  readonly locale: string;
  readonly code: string;
  readonly message: string;
  readonly fileWritten: boolean;
}

export function failureViews(
  failures: readonly ValueReplaceLocaleFailure[],
): readonly FailureView[] {
  return failures.map((failure) => ({
    locale: failure.locale,
    code: failure.code,
    message: failure.message,
    fileWritten: failure.fileWritten === true,
  }));
}

export function replacedCount(outcomes: readonly ValueReplaceOutcome[]): number {
  return outcomes.filter((outcome) => outcome.status === "applied").length;
}

export function valueCount(count: number): string {
  return `${count} ${count === 1 ? "value" : "values"}`;
}
