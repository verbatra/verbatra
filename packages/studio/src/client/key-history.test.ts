import { describe, expect, it } from "vitest";
import {
  CURRENT_REASON,
  diffKindLabel,
  emptyHistoryMessage,
  hasWordDiff,
  incompleteNotices,
  type KeyHistoryAvailable,
  type KeyRevisionRow,
  READ_ONLY_REASON,
  REDACTED_REASON,
  restoreOffer,
  restoreOfferReason,
  transientKeyHistoryError,
  unavailableHistoryMessage,
} from "./key-history.js";

function revision(overrides: Partial<KeyRevisionRow> = {}): KeyRevisionRow {
  return {
    commit: "a".repeat(40),
    authorDate: "2026-01-02T03:04:05+00:00",
    author: "Ada",
    subject: "reword",
    value: "old",
    sourceChanged: false,
    diff: [],
    ...overrides,
  };
}

function available(overrides: Partial<KeyHistoryAvailable> = {}): KeyHistoryAvailable {
  return { available: true, revisions: [], truncated: false, unreadableRevisions: 0, ...overrides };
}

describe("restoreOffer", () => {
  it("offers a restore without a confirm when the source is unchanged", () => {
    expect(restoreOffer(revision(), "new", true)).toEqual({ kind: "restore", needsConfirm: false });
  });

  it.each([true, "unknown"] as const)("asks for a confirm when sourceChanged is %s", (changed) => {
    expect(restoreOffer(revision({ sourceChanged: changed }), "new", true)).toEqual({
      kind: "restore",
      needsConfirm: true,
    });
  });

  it("never offers a redacted value, even when it equals the current one", () => {
    const offer = restoreOffer(
      revision({ valueRedacted: true, value: "[REDACTED]" }),
      "[REDACTED]",
      true,
    );

    expect(offer).toEqual({ kind: "redacted" });
    expect(restoreOfferReason(offer)).toBe(REDACTED_REASON);
  });

  it("takes the current state from the key and not from the first revision", () => {
    expect(restoreOffer(revision({ value: "same" }), "same", true)).toEqual({ kind: "current" });
    expect(restoreOfferReason({ kind: "current" })).toBe(CURRENT_REASON);
    expect(restoreOffer(revision({ value: "same" }), undefined, true).kind).toBe("restore");
  });

  it("offers nothing when the project cannot be written", () => {
    const offer = restoreOffer(revision(), "new", false);

    expect(offer).toEqual({ kind: "unavailable" });
    expect(restoreOfferReason(offer)).toBe(READ_ONLY_REASON);
    expect(restoreOfferReason({ kind: "restore", needsConfirm: false })).toBeUndefined();
  });
});

describe("incompleteNotices", () => {
  it("is empty for a complete history", () => {
    expect(incompleteNotices(available())).toEqual([]);
  });

  it("names every kind of incompleteness it was given", () => {
    const notices = incompleteNotices(
      available({ truncated: true, unreadableRevisions: 2, workingTreeUnreadable: true }),
    );

    expect(notices).toHaveLength(3);
    expect(notices[0]).toContain("incomplete");
    expect(notices[1]).toContain("2 commits");
    expect(notices[2]).toContain("uncommitted");
  });

  it("uses the singular for one unreadable commit", () => {
    expect(incompleteNotices(available({ unreadableRevisions: 1 }))[0]).toContain("1 commit ");
  });
});

describe("emptyHistoryMessage", () => {
  it("does not claim a clean history when the answer is partial", () => {
    expect(emptyHistoryMessage(available())).toContain("No commit has changed");
    expect(emptyHistoryMessage(available({ truncated: true }))).toContain("could read");
    expect(emptyHistoryMessage(available({ unreadableRevisions: 1 }))).toContain("could read");
  });
});

describe("transientKeyHistoryError", () => {
  it("turns only a timeout and a git failure into an error", () => {
    expect(transientKeyHistoryError({ available: false, reason: "timeout" })?.code).toBe(
      "GIT_TIMEOUT",
    );
    expect(transientKeyHistoryError({ available: false, reason: "git-failed" })?.code).toBe(
      "GIT_FAILED",
    );
    expect(
      transientKeyHistoryError({ available: false, reason: "not-a-repository" }),
    ).toBeUndefined();
    expect(transientKeyHistoryError(available())).toBeUndefined();
  });

  it("words an unavailable reason", () => {
    expect(unavailableHistoryMessage({ available: false, reason: "not-a-repository" })).toContain(
      "not in a git repository",
    );
  });
});

describe("diff helpers", () => {
  it("labels added and removed runs and leaves equal text bare", () => {
    expect(diffKindLabel("added")).toBe("added: ");
    expect(diffKindLabel("removed")).toBe("removed: ");
    expect(diffKindLabel("equal")).toBeUndefined();
  });

  it("treats a diff of only additions as no word diff", () => {
    expect(hasWordDiff([{ kind: "added", text: "x" }])).toBe(false);
    expect(hasWordDiff([{ kind: "equal", text: "x" }])).toBe(true);
    expect(hasWordDiff([])).toBe(false);
  });
});
