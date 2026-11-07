import type { KeyRevisionsResult } from "../shared/rpc/key-revisions.js";
import { GIT_UNAVAILABLE_MESSAGES } from "./git-changes.js";

export type KeyHistoryAvailable = Extract<KeyRevisionsResult, { readonly available: true }>;

export type KeyHistoryUnavailable = Extract<KeyRevisionsResult, { readonly available: false }>;

export type KeyRevisionRow = KeyHistoryAvailable["revisions"][number];

export type KeyHistorySegments = KeyRevisionRow["diff"];

export const KEY_HISTORY_DEFAULT_LIMIT = 50;

export const KEY_HISTORY_DEEP_LIMIT = 200;

export const KEY_HISTORY_PAGE_SIZE = 20;

export type CurrentValue =
  | { readonly kind: "known"; readonly value: string | undefined }
  | { readonly kind: "loading" }
  | { readonly kind: "failed"; readonly message: string };

export type SourceConfirm = "changed" | "unknown";

export type RestoreOffer =
  | { readonly kind: "restore"; readonly confirm: SourceConfirm | null }
  | { readonly kind: "redacted" }
  | { readonly kind: "current" }
  | { readonly kind: "unknown"; readonly reason: string };

export const REDACTED_REASON =
  "History does not show this value because it looks like an API key, and it cannot be restored from here.";

export const REDACTED_WORKING_TREE_REASON =
  "History does not show this value because it looks like an API key.";

export const CURRENT_REASON = "This is the value the key has now.";

export const CURRENT_LOADING_REASON = "Restore is available once the current value has been read.";

export function currentFailedReason(message: string): string {
  return `Restore is unavailable because the current value could not be read: ${message}`;
}

const CONSEQUENCES =
  "If you save the restored value, the key counts as up to date against the current source and the value is added to translation memory.";

export const SOURCE_CONFIRM_TEXT: Readonly<Record<SourceConfirm, string>> = {
  changed: `The source text has changed since this commit. ${CONSEQUENCES}`,
  unknown: `Studio cannot tell whether the source text has changed since this commit. ${CONSEQUENCES}`,
};

function unknownReason(current: CurrentValue): string {
  return current.kind === "failed" ? currentFailedReason(current.message) : CURRENT_LOADING_REASON;
}

export function restoreOffer(revision: KeyRevisionRow, current: CurrentValue): RestoreOffer {
  if (revision.valueRedacted === true) {
    return { kind: "redacted" };
  }
  if (current.kind !== "known") {
    return { kind: "unknown", reason: unknownReason(current) };
  }
  if (revision.value === current.value) {
    return { kind: "current" };
  }
  const { sourceChanged } = revision;
  return {
    kind: "restore",
    confirm: sourceChanged === false ? null : sourceChanged === true ? "changed" : "unknown",
  };
}

export function needsConfirm(offer: RestoreOffer): boolean {
  return offer.kind === "restore" && offer.confirm !== null;
}

export function restoreOfferReason(offer: RestoreOffer): string | undefined {
  switch (offer.kind) {
    case "redacted":
      return REDACTED_REASON;
    case "current":
      return CURRENT_REASON;
    case "unknown":
      return offer.reason;
    case "restore":
      return undefined;
  }
}

export function atReadCap(requestedLimit: number): boolean {
  return requestedLimit >= KEY_HISTORY_DEEP_LIMIT;
}

export function limitIsReason(result: KeyHistoryAvailable): boolean {
  return result.truncatedBy.includes("commit-limit");
}

export function canReadFurther(result: KeyHistoryAvailable, requestedLimit: number): boolean {
  return limitIsReason(result) && !atReadCap(requestedLimit);
}

function limitNotice(requestedLimit: number): string {
  return atReadCap(requestedLimit)
    ? `Studio reads at most ${KEY_HISTORY_DEEP_LIMIT} commits, and that is as far as it goes here.`
    : `Studio examined the newest ${requestedLimit} commits, so older commits were not read.`;
}

function unreadableNotice(count: number): string {
  if (count === 0) {
    return "A commit's file could not be read or parsed, so that commit is not shown.";
  }
  return `${count} ${count === 1 ? "commit" : "commits"} could not be shown because the file could not be read, could not be parsed or held a value that is too long.`;
}

const REASON_NOTICES: Readonly<Record<string, string>> = {
  "shallow-clone": "This clone is shallow, so its older history is not here.",
  "file-too-large": "A locale file at some commit was above the size limit and was not read.",
  "byte-budget": "One read has a size budget, and older commits were past it.",
  deadline: "The read took too long and stopped before it reached every commit.",
  "source-unreadable":
    "The source file could not be read in full, so whether the source changed is unknown for some revisions.",
  "records-unreadable":
    "A lock or provenance file could not be read in full, so the origin or the source change is unknown for some revisions.",
  "scrub-cap":
    "More distinct keys turned up than Studio could hide from every revision, so a key may stay readable in part of this list.",
};

export function incompleteNotices(
  result: KeyHistoryAvailable,
  requestedLimit: number,
): readonly string[] {
  const notices = result.truncatedBy.flatMap((reason) => {
    if (reason === "commit-limit") {
      return [limitNotice(requestedLimit)];
    }
    if (reason === "unreadable-revision") {
      return [unreadableNotice(result.unreadableRevisions)];
    }
    return [REASON_NOTICES[reason] as string];
  });
  if (result.workingTreeUnreadable === true) {
    notices.push(
      "The file on disk could not be compared with the last commit, so an uncommitted value is not shown.",
    );
  }
  return notices;
}

export function emptyHistoryMessage(result: KeyHistoryAvailable, requestedLimit: number): string {
  if (limitIsReason(result)) {
    return atReadCap(requestedLimit)
      ? `No change to this key was found within ${KEY_HISTORY_DEEP_LIMIT} commits.`
      : `No change to this key was found in the newest ${requestedLimit} commits.`;
  }
  return result.truncated
    ? "No change to this key was found in the commits Studio could read."
    : "No commit has changed this key's value yet.";
}

export function unavailableHistoryMessage(result: KeyHistoryUnavailable): string {
  return GIT_UNAVAILABLE_MESSAGES[result.reason];
}

export function hasWordDiff(segments: KeyHistorySegments): boolean {
  return segments.some((segment) => segment.kind !== "added");
}

export function diffKindLabel(kind: KeyHistorySegments[number]["kind"]): string | undefined {
  if (kind === "added") {
    return "added: ";
  }
  return kind === "removed" ? "removed: " : undefined;
}

export function needsSeparator(
  previous: KeyHistorySegments[number] | undefined,
  next: KeyHistorySegments[number],
): boolean {
  return (
    previous !== undefined &&
    previous.kind !== "equal" &&
    next.kind !== "equal" &&
    previous.kind !== next.kind &&
    !/\s$/.test(previous.text) &&
    !/^\s/.test(next.text)
  );
}

export function shownRevisions<T>(revisions: readonly T[], shown: number): readonly T[] {
  return revisions.slice(0, shown);
}
