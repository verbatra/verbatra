// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { StatusData } from "../client/coverage.js";
import type { GitDiffView, GitStatusData, GitStatusView } from "../client/git-changes.js";
import type { ReviewQueueData } from "../client/review-queue-data.js";
import type { RefreshableView, StructuredError } from "../client/state.js";
import type { UsageTickerData } from "../client/usage-ticker-data.js";
import type { GitLocaleDiffResult } from "../shared/rpc/git.js";
import { type OverviewReads, pageFailure } from "./overview-failures.js";
import { reviewQueueView } from "./test-support.js";
import type { DiffState } from "./use-diff-state.js";
import type { HistoryState } from "./use-history-list.js";
import type { LockView } from "./use-lock-state.js";

const BAD: StructuredError = { code: "LOCK_FILE_INVALID", message: "bad lock" };
const OTHER: StructuredError = { code: "INTERNAL", message: "boom" };
const DATA: StatusData = { inSync: true, rows: [] };
const USAGE: UsageTickerData = { available: false };

const GIT_STATUS_DATA: GitStatusData = {
  result: { available: true, branch: "main", files: [] },
  lastAvailable: undefined,
};

const GIT_DIFF_DATA: GitLocaleDiffResult = {
  available: true,
  path: "locales/de.json",
  state: "modified",
  added: [],
  removed: [],
  changed: [],
  truncated: false,
};

const CALM: OverviewReads = {
  diff: { kind: "loaded", hasPendingChanges: false, locales: [] },
  status: { kind: "data", data: DATA, stale: false },
  lock: { kind: "no-lock" },
  review: reviewQueueView(0),
  usage: { kind: "data", data: USAGE, stale: false },
  history: { kind: "loaded", commits: [] },
};

function reads(over: Partial<OverviewReads>): OverviewReads {
  return { ...CALM, ...over };
}

const CALM_DIFF: Extract<DiffState, { readonly kind: "loaded" }> = {
  kind: "loaded",
  hasPendingChanges: false,
  locales: [],
};

const staleStatus = (error: StructuredError): RefreshableView<StatusData> => ({
  kind: "data",
  data: DATA,
  stale: true,
  error,
});

describe("pageFailure", () => {
  it("is null while every read is loading, loaded or empty", () => {
    expect(
      pageFailure({
        diff: { kind: "loading" },
        status: { kind: "loading" },
        lock: { kind: "loading" },
        review: { kind: "loading" },
        usage: { kind: "loading" },
        history: { kind: "loading" },
      }),
    ).toBeNull();
    expect(pageFailure(CALM)).toBeNull();
    expect(pageFailure(reads({ review: undefined }))).toBeNull();
  });

  it("takes the first hard failure in read order, with no prefix", () => {
    expect(
      pageFailure(
        reads({
          status: { kind: "error", error: OTHER },
          lock: { kind: "error", error: BAD },
        }),
      ),
    ).toEqual({ error: OTHER });
    expect(pageFailure(reads({ diff: { kind: "error", error: BAD } }))).toEqual({ error: BAD });
    expect(pageFailure(reads({ lock: { kind: "error", error: BAD } }))).toEqual({ error: BAD });
  });

  it("includes a failed review read, a failed usage read and a failed history read", () => {
    expect(pageFailure(reads({ review: { kind: "error", error: OTHER } }))).toEqual({
      error: OTHER,
    });
    expect(pageFailure(reads({ usage: { kind: "error", error: OTHER } }))).toEqual({
      error: OTHER,
    });
    expect(pageFailure(reads({ history: { kind: "error", error: BAD } }))).toEqual({ error: BAD });
  });

  it("does not treat an unreadable review state as a failed read", () => {
    const unavailable: RefreshableView<ReviewQueueData> = {
      kind: "data",
      stale: false,
      data: { available: false, reason: "provenance-unreadable" },
    };

    expect(pageFailure(reads({ review: unavailable }))).toBeNull();
  });

  it("names a stale source that shares the hard error's code", () => {
    const staleLock: LockView = { kind: "loaded", version: 1, locales: [], staleError: OTHER };

    expect(
      pageFailure(reads({ status: { kind: "error", error: OTHER }, lock: staleLock })),
    ).toEqual({ error: OTHER, prefix: "Showing the last known lock file." });
  });

  it("does not name a stale source whose code differs from the hard error's", () => {
    const staleLock: LockView = { kind: "loaded", version: 1, locales: [], staleError: BAD };

    expect(
      pageFailure(reads({ status: { kind: "error", error: OTHER }, lock: staleLock })),
    ).toEqual({ error: OTHER });
  });

  it("names every stale source sharing the code, usage and history included", () => {
    const staleDiff: DiffState = {
      kind: "loaded",
      hasPendingChanges: false,
      locales: [],
      staleError: OTHER,
    };
    const staleUsage: RefreshableView<UsageTickerData> = {
      kind: "data",
      data: USAGE,
      stale: true,
      error: OTHER,
    };
    const staleHistory: HistoryState = { kind: "loaded", commits: [], staleError: OTHER };

    expect(
      pageFailure(
        reads({
          diff: staleDiff,
          status: staleStatus(OTHER),
          review: {
            kind: "data",
            data: { available: true, locales: [] },
            stale: true,
            error: OTHER,
          },
          usage: staleUsage,
          history: staleHistory,
        }),
      ),
    ).toEqual({
      error: OTHER,
      prefix: "Showing the last known pending changes, coverage, review queue, usage and history.",
    });
  });

  it("names a stale review queue even when the hard error has another code", () => {
    const staleReview: RefreshableView<ReviewQueueData> = {
      kind: "data",
      data: { available: true, locales: [] },
      stale: true,
      error: BAD,
    };

    expect(
      pageFailure(reads({ status: { kind: "error", error: OTHER }, review: staleReview })),
    ).toEqual({ error: OTHER, prefix: "Showing the last known review queue." });
  });

  it("names a stale review queue beside a stale source of another code", () => {
    const staleReview: RefreshableView<ReviewQueueData> = {
      kind: "data",
      data: { available: true, locales: [] },
      stale: true,
      error: BAD,
    };

    expect(
      pageFailure(reads({ diff: { ...CALM_DIFF, staleError: OTHER }, review: staleReview })),
    ).toEqual({ error: OTHER, prefix: "Showing the last known pending changes and review queue." });
  });

  it("reports a stale lock alone", () => {
    const staleLock: LockView = { kind: "loaded", version: 1, locales: [], staleError: BAD };

    expect(pageFailure(reads({ lock: staleLock }))).toEqual({
      error: BAD,
      prefix: "Showing the last known lock file.",
    });
  });

  it("reads a hard changed-files failure as the page failure", () => {
    expect(pageFailure(reads({ gitStatus: { kind: "error", error: OTHER } }))).toEqual({
      error: OTHER,
    });
  });

  it("names a stale changed-files read and a stale key-changes read that share the code", () => {
    expect(
      pageFailure(
        reads({
          lock: { kind: "error", error: BAD },
          gitStatus: { kind: "data", data: GIT_STATUS_DATA, stale: true, error: BAD },
          gitDiff: { kind: "data", data: GIT_DIFF_DATA, stale: true, error: BAD },
        }),
      ),
    ).toEqual({
      error: BAD,
      prefix: "Showing the last known changed files and key changes.",
    });
  });

  it("leaves a stale key-changes read of another code to its own section", () => {
    const stale: GitDiffView = { kind: "data", data: GIT_DIFF_DATA, stale: true, error: OTHER };

    expect(pageFailure(reads({ lock: { kind: "error", error: BAD }, gitDiff: stale }))).toEqual({
      error: BAD,
    });
  });

  it("ignores a changes read that is loading, loaded or not made", () => {
    expect(
      pageFailure(
        reads({
          gitStatus: { kind: "loading" },
          gitDiff: { kind: "data", data: GIT_DIFF_DATA, stale: false },
        }),
      ),
    ).toBeNull();
  });

  it.each([
    ["timeout", "GIT_TIMEOUT"],
    ["git-failed", "GIT_GIT_FAILED"],
  ] as const)(
    "gives a %s answer of the changes read to the page alert, with the page Retry",
    (reason, code) => {
      const view: GitStatusView = {
        kind: "data",
        stale: false,
        data: { result: { available: false, reason }, lastAvailable: undefined },
      };

      expect(pageFailure(reads({ gitStatus: view }))?.error.code).toBe(code);
    },
  );

  it("gives a transient key diff answer to the page alert", () => {
    const view: GitDiffView = {
      kind: "data",
      stale: false,
      data: { available: false, reason: "timeout" },
    };

    expect(pageFailure(reads({ gitDiff: view }))?.error.code).toBe("GIT_TIMEOUT");
  });

  it.each(["not-a-repository", "git-missing", "outside-project", "custom-adapter"] as const)(
    "leaves the lasting reason %s to a calm note, never the page alert",
    (reason) => {
      const view: GitStatusView = {
        kind: "data",
        stale: false,
        data: { result: { available: false, reason }, lastAvailable: undefined },
      };

      expect(pageFailure(reads({ gitStatus: view }))).toBeNull();
    },
  );

  it("does not read an older transient answer as a failure while the newest read failed another way", () => {
    const view: GitStatusView = {
      kind: "data",
      stale: true,
      error: OTHER,
      data: {
        result: { available: false, reason: "timeout" },
        lastAvailable: undefined,
      },
    };

    expect(pageFailure(reads({ gitStatus: view }))?.error).toEqual(OTHER);
  });
});
