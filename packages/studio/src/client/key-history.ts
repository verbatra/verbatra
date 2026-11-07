import type { KeyRevisionsResult } from "../shared/rpc/key-revisions.js";
import { GIT_UNAVAILABLE_MESSAGES } from "./git-changes.js";
import type { StructuredError } from "./state.js";

export type KeyHistoryAvailable = Extract<KeyRevisionsResult, { readonly available: true }>;

export type KeyHistoryUnavailable = Extract<KeyRevisionsResult, { readonly available: false }>;

export type KeyRevisionRow = KeyHistoryAvailable["revisions"][number];

export type KeyHistorySegments = KeyRevisionRow["diff"];

export type RestoreOffer =
  | { readonly kind: "restore"; readonly needsConfirm: boolean }
  | { readonly kind: "redacted" }
  | { readonly kind: "current" }
  | { readonly kind: "unavailable" };

export const REDACTED_REASON =
  "This value held what looks like an API key, so Studio hides it and cannot restore it.";

export const CURRENT_REASON = "This is the value the key has now.";

export const READ_ONLY_REASON = "Studio was started without write access, so nothing can be saved.";

export const SOURCE_CHANGED_CONFIRM =
  "The source text has changed since this commit, or Studio cannot tell. If you save the restored value, the key counts as up to date against the current source and the value is added to translation memory.";

export function restoreOffer(
  revision: KeyRevisionRow,
  current: string | undefined,
  canWrite: boolean,
): RestoreOffer {
  if (revision.valueRedacted === true) {
    return { kind: "redacted" };
  }
  if (revision.value === current) {
    return { kind: "current" };
  }
  if (!canWrite) {
    return { kind: "unavailable" };
  }
  return { kind: "restore", needsConfirm: revision.sourceChanged !== false };
}

export function restoreOfferReason(offer: RestoreOffer): string | undefined {
  switch (offer.kind) {
    case "redacted":
      return REDACTED_REASON;
    case "current":
      return CURRENT_REASON;
    case "unavailable":
      return READ_ONLY_REASON;
    case "restore":
      return undefined;
  }
}

export function incompleteNotices(result: KeyHistoryAvailable): readonly string[] {
  const notices: string[] = [];
  if (result.truncated) {
    notices.push(
      "This list may be incomplete: older commits were not read, the clone is shallow, or something could not be read in full.",
    );
  }
  if (result.unreadableRevisions > 0) {
    const count = result.unreadableRevisions;
    notices.push(
      `${count} ${count === 1 ? "commit" : "commits"} could not be shown because the file could not be read or the value was too long.`,
    );
  }
  if (result.workingTreeUnreadable === true) {
    notices.push(
      "The file on disk could not be compared with the last commit, so an uncommitted value is not shown.",
    );
  }
  return notices;
}

export function emptyHistoryMessage(result: KeyHistoryAvailable): string {
  return result.truncated || result.unreadableRevisions > 0
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

export function transientKeyHistoryError(result: KeyRevisionsResult): StructuredError | undefined {
  if (result.available || (result.reason !== "timeout" && result.reason !== "git-failed")) {
    return undefined;
  }
  return {
    code: result.reason === "timeout" ? "GIT_TIMEOUT" : "GIT_FAILED",
    message: GIT_UNAVAILABLE_MESSAGES[result.reason],
  };
}
