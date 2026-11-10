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
import type { StructuredError } from "./state.js";

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
  "stale-source": "Source changed",
  "gate-refused": "Refused",
  "too-long": "Too long",
  pinned: "Pinned",
  protected: "Protected",
  "no-source-entry": "No source",
  unchanged: "Unchanged",
};

const STATUS_NOTE: Readonly<Record<ValueReplaceStatus, string>> = {
  ready: "Can be replaced.",
  "stale-source":
    "Can be replaced. The source text changed since this was translated, so the key stays out of date.",
  "gate-refused": "The integrity gate would refuse the new value.",
  "too-long": "The new value would be over 20,000 characters.",
  pinned: "A pinned key. Left out unless you opt in.",
  protected:
    "A person wrote, imported or changed this outside verbatra. Left out unless you opt in.",
  "no-source-entry": "There is no source text to check the new value against.",
  unchanged: "The replacement would not change this value.",
};

const OPTED_IN_NOTE: Readonly<Partial<Record<ValueReplaceStatus, string>>> = {
  pinned: "A pinned key. Included in this run because you ticked its box.",
  protected:
    "A person wrote, imported or changed this outside verbatra. Included in this run because you ticked its box.",
};

export function statusNote(status: ValueReplaceStatus, optedIn = false): string {
  return (optedIn ? OPTED_IN_NOTE[status] : undefined) ?? STATUS_NOTE[status];
}

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
  const label = Object.hasOwn(REASON_LABEL, reason) ? REASON_LABEL[reason] : undefined;
  return label ?? reason;
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
  readonly note: string;
  readonly tone: ReplaceTone;
  readonly details: readonly string[];
}

const SKIP_NOTE: Readonly<Record<string, string>> = {
  pinned: "A pinned key, left out.",
  protected: "A protected value, left out.",
  "no-source-entry": "There is no source text to check the new value against.",
  unchanged: "The value would not change.",
  "duplicate-entry": "Listed twice, so only the first was used.",
  "locale-failed": "The locale failed before this value was reached, so nothing was written.",
};

export function outcomeView(outcome: ValueReplaceOutcome): OutcomeView {
  switch (outcome.status) {
    case "applied":
      return outcome.staleSource
        ? {
            label: "Replaced",
            note: "Still out of date: the source text changed since this was translated.",
            tone: "warning",
            details: [],
          }
        : { label: "Replaced", note: "", tone: "success", details: [] };
    case "skipped":
      return {
        label: outcome.reason === "locale-failed" ? "Not attempted" : "Skipped",
        note: SKIP_NOTE[outcome.reason] ?? outcome.reason,
        tone: outcome.reason === "locale-failed" ? "danger" : "neutral",
        details: [],
      };
    case "refused":
      return {
        label: "Refused",
        note: `Not written: ${reasonLabel(outcome.reason)}.`,
        tone: "danger",
        details: outcome.details ?? [],
      };
    case "changed":
      return {
        label: "Not changed",
        note: "The value changed since the preview, so nothing was written.",
        tone: "warning",
        details: [],
      };
    case "too-long":
      return {
        label: "Too long",
        note: "The new value would be over 20,000 characters, so nothing was written.",
        tone: "danger",
        details: [],
      };
  }
}

export interface KeyedDetail {
  readonly key: string;
  readonly text: string;
}

export function keyedDetails(details: readonly string[]): readonly KeyedDetail[] {
  const seen = new Map<string, number>();
  return details.map((text) => {
    const count = (seen.get(text) ?? 0) + 1;
    seen.set(text, count);
    return { key: `${text}\u0000${count}`, text };
  });
}

export function notSentEntries(
  preview: ValueReplacePreview,
  optIns: ReplaceOptIns,
): readonly ValueReplacePreviewEntry[] {
  return preview.entries.filter((entry) => !isSendable(entry.status, optIns));
}

const LARGE_NUMBER = /\d{4,}/g;

export function withGroupedNumbers(message: string): string {
  return message.replace(LARGE_NUMBER, (digits) => Number(digits).toLocaleString("en-US"));
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

export function groupedCount(count: number): string {
  return count.toLocaleString("en-US");
}

export function valueCount(count: number): string {
  return `${groupedCount(count)} ${count === 1 ? "value" : "values"}`;
}

const COUNT_PLURALS = new Intl.PluralRules("en");

export function matchSentence(count: number): string {
  const verb = COUNT_PLURALS.select(count) === "one" ? "matches" : "match";
  return `${valueCount(count)} ${verb}.`;
}

export type CriteriaField = "find" | "replace";

const FIND_TEXT_INVALID = "FIND_TEXT_INVALID";

export function criteriaFieldOf(error: StructuredError | null): CriteriaField | null {
  if (error === null || error.code !== FIND_TEXT_INVALID) {
    return null;
  }
  return error.message.startsWith("The replace text") ? "replace" : "find";
}
