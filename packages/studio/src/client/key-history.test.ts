import { describe, expect, it } from "vitest";
import {
  atReadCap,
  CURRENT_LOADING_REASON,
  CURRENT_REASON,
  type CurrentValue,
  canReadFurther,
  currentFailedReason,
  diffKindLabel,
  emptyHistoryMessage,
  hasWordDiff,
  incompleteNotices,
  KEY_HISTORY_DEEP_LIMIT,
  KEY_HISTORY_DEFAULT_LIMIT,
  type KeyHistoryAvailable,
  type KeyRevisionRow,
  needsSeparator,
  REDACTED_REASON,
  restoreOffer,
  restoreOfferReason,
  SOURCE_CONFIRM_TEXT,
  shownRevisions,
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

const KNOWN = (value: string | undefined): CurrentValue => ({ kind: "known", value });

describe("restoreOffer", () => {
  it("offers a restore without a confirm when the source is unchanged", () => {
    expect(restoreOffer(revision(), KNOWN("new"))).toEqual({ kind: "restore", confirm: null });
  });

  it.each([
    [true, "changed"],
    ["unknown", "unknown"],
  ] as const)("asks for a %s confirm when sourceChanged is %s", (changed, confirm) => {
    expect(restoreOffer(revision({ sourceChanged: changed }), KNOWN("new"))).toEqual({
      kind: "restore",
      confirm,
    });
  });

  it("words the two confirms differently and names both consequences in each", () => {
    expect(SOURCE_CONFIRM_TEXT.changed).toContain("has changed since this commit");
    expect(SOURCE_CONFIRM_TEXT.unknown).toContain("cannot tell");
    for (const text of Object.values(SOURCE_CONFIRM_TEXT)) {
      expect(text).toContain("up to date");
      expect(text).toContain("translation memory");
    }
  });

  it("never offers a redacted value, even when it equals the current one or the current one is unknown", () => {
    const redacted = revision({ valueRedacted: true, value: "[REDACTED]" });

    expect(restoreOffer(redacted, KNOWN("[REDACTED]"))).toEqual({ kind: "redacted" });
    expect(restoreOffer(redacted, { kind: "loading" })).toEqual({ kind: "redacted" });
    expect(restoreOfferReason({ kind: "redacted" })).toBe(REDACTED_REASON);
    expect(REDACTED_REASON).not.toContain("Studio hides");
  });

  it("takes the current state from the key and not from the first revision", () => {
    expect(restoreOffer(revision({ value: "same" }), KNOWN("same"))).toEqual({ kind: "current" });
    expect(restoreOfferReason({ kind: "current" })).toBe(CURRENT_REASON);
    expect(restoreOffer(revision({ value: "same" }), KNOWN(undefined)).kind).toBe("restore");
  });

  it("offers nothing until the current value is known, and says why", () => {
    const loading = restoreOffer(revision(), { kind: "loading" });
    const failed = restoreOffer(revision(), { kind: "failed", message: "disk on fire" });

    expect(loading).toEqual({ kind: "unknown", reason: CURRENT_LOADING_REASON });
    expect(restoreOfferReason(loading)).toBe(CURRENT_LOADING_REASON);
    expect(failed.kind).toBe("unknown");
    expect(restoreOfferReason(failed)).toBe(currentFailedReason("disk on fire"));
    expect(currentFailedReason("disk on fire")).toContain("disk on fire");
    expect(restoreOfferReason({ kind: "restore", confirm: null })).toBeUndefined();
  });
});

describe("reading further", () => {
  it("offers the cap step only while truncated and below the cap", () => {
    expect(canReadFurther(available({ truncated: true }), KEY_HISTORY_DEFAULT_LIMIT)).toBe(true);
    expect(canReadFurther(available({ truncated: false }), KEY_HISTORY_DEFAULT_LIMIT)).toBe(false);
    expect(canReadFurther(available({ truncated: true }), KEY_HISTORY_DEEP_LIMIT)).toBe(false);
    expect(atReadCap(KEY_HISTORY_DEEP_LIMIT)).toBe(true);
    expect(atReadCap(KEY_HISTORY_DEFAULT_LIMIT)).toBe(false);
  });

  it("says at the cap that this is as far as Studio reads", () => {
    const atCap = incompleteNotices(available({ truncated: true }), KEY_HISTORY_DEEP_LIMIT);
    const below = incompleteNotices(available({ truncated: true }), KEY_HISTORY_DEFAULT_LIMIT);

    expect(atCap[0]).toContain("as far as it goes");
    expect(below[0]).not.toContain("as far as it goes");
  });
});

describe("incompleteNotices", () => {
  it("is empty for a complete history", () => {
    expect(incompleteNotices(available(), 50)).toEqual([]);
  });

  it("names every kind of incompleteness it was given", () => {
    const notices = incompleteNotices(
      available({ truncated: true, unreadableRevisions: 2, workingTreeUnreadable: true }),
      50,
    );

    expect(notices).toHaveLength(3);
    expect(notices[0]).toContain("incomplete");
    expect(notices[1]).toContain("2 commits");
    expect(notices[2]).toContain("uncommitted");
  });

  it("uses the singular for one unreadable commit", () => {
    expect(incompleteNotices(available({ unreadableRevisions: 1 }), 50)[0]).toContain("1 commit ");
  });
});

describe("emptyHistoryMessage", () => {
  it("does not claim a clean history when the answer is partial", () => {
    expect(emptyHistoryMessage(available())).toContain("No commit has changed");
    expect(emptyHistoryMessage(available({ truncated: true }))).toContain(
      "Older commits were not read",
    );
    expect(emptyHistoryMessage(available({ unreadableRevisions: 1 }))).toContain("could read");
  });
});

describe("unavailable reasons", () => {
  it("words an unavailable reason", () => {
    expect(unavailableHistoryMessage({ available: false, reason: "not-a-repository" })).toContain(
      "not in a git repository",
    );
  });
});

describe("needsSeparator", () => {
  const removed = { kind: "removed", text: "Servus" } as const;
  const added = { kind: "added", text: "Moin" } as const;

  it("separates a removed word from the added word that follows it", () => {
    expect(needsSeparator(removed, added)).toBe(true);
    expect(needsSeparator(added, removed)).toBe(true);
  });

  it("adds nothing between runs of the same kind, around equal text, or at the start", () => {
    expect(needsSeparator(undefined, removed)).toBe(false);
    expect(needsSeparator(removed, removed)).toBe(false);
    expect(needsSeparator({ kind: "equal", text: "a" }, added)).toBe(false);
    expect(needsSeparator(removed, { kind: "equal", text: "a" })).toBe(false);
  });

  it("adds nothing when whitespace already separates the runs", () => {
    expect(needsSeparator({ kind: "removed", text: "Servus " }, added)).toBe(false);
    expect(needsSeparator(removed, { kind: "added", text: " Moin" })).toBe(false);
  });
});

describe("shownRevisions", () => {
  it("shows the first rows only", () => {
    expect(shownRevisions([1, 2, 3], 2)).toEqual([1, 2]);
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
