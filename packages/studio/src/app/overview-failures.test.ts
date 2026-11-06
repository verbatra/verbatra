import { describe, expect, it } from "vitest";
import type { StatusData } from "../client/coverage.js";
import type { RefreshableView, StructuredError } from "../client/state.js";
import { pageFailure } from "./overview-failures.js";
import type { DiffState } from "./use-diff-state.js";
import type { LockView } from "./use-lock-state.js";

const BAD: StructuredError = { code: "LOCK_FILE_INVALID", message: "bad lock" };
const OTHER: StructuredError = { code: "INTERNAL", message: "boom" };
const DATA: StatusData = { inSync: true, rows: [] };

const DIFF_OK: DiffState = { kind: "loaded", hasPendingChanges: false, locales: [] };
const STATUS_OK: RefreshableView<StatusData> = { kind: "data", data: DATA, stale: false };
const LOCK_OK: LockView = { kind: "no-lock" };

describe("pageFailure", () => {
  it("is null while every read is loading, loaded or empty", () => {
    expect(pageFailure({ kind: "loading" }, { kind: "loading" }, { kind: "loading" })).toBeNull();
    expect(pageFailure(DIFF_OK, STATUS_OK, LOCK_OK)).toBeNull();
  });

  it("takes the first hard failure in diff, status, lock order, with no prefix", () => {
    expect(
      pageFailure(DIFF_OK, { kind: "error", error: OTHER }, { kind: "error", error: BAD }),
    ).toEqual({ error: OTHER });
    expect(pageFailure({ kind: "error", error: BAD }, STATUS_OK, LOCK_OK)).toEqual({ error: BAD });
    expect(pageFailure(DIFF_OK, STATUS_OK, { kind: "error", error: BAD })).toEqual({ error: BAD });
  });

  it("prefers a hard failure over stale ones", () => {
    const staleDiff: DiffState = { ...DIFF_OK, staleError: OTHER };

    expect(pageFailure(staleDiff, { kind: "error", error: BAD }, LOCK_OK)).toEqual({ error: BAD });
  });

  it("names every stale source that shares the first stale error's code", () => {
    const staleDiff: DiffState = { ...DIFF_OK, staleError: OTHER };
    const staleStatus: RefreshableView<StatusData> = {
      kind: "data",
      data: DATA,
      stale: true,
      error: OTHER,
    };
    const staleLock: LockView = { kind: "loaded", version: 1, locales: [], staleError: BAD };

    expect(pageFailure(staleDiff, staleStatus, staleLock)).toEqual({
      error: OTHER,
      prefix: "Showing the last known pending changes, status.",
    });
  });

  it("reports a stale lock alone", () => {
    const staleLock: LockView = { kind: "loaded", version: 1, locales: [], staleError: BAD };

    expect(pageFailure(DIFF_OK, STATUS_OK, staleLock)).toEqual({
      error: BAD,
      prefix: "Showing the last known lock file.",
    });
  });
});
