import {
  BatchInterruptedError,
  type LoadedConfig,
  type RetranslateEntriesInput,
  type ReviewEntriesInput,
} from "@verbatra/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { baseStudioConfig } from "../test-support.js";

const calls = vi.hoisted(() => ({
  retranslate: [] as unknown[],
  approve: [] as unknown[],
  failure: undefined as unknown,
}));

vi.mock("@verbatra/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@verbatra/sdk")>();
  const settle = <T>(value: T): Promise<T> =>
    calls.failure === undefined ? Promise.resolve(value) : Promise.reject(calls.failure);
  return {
    ...actual,
    retranslateEntries: async (input: RetranslateEntriesInput) => {
      calls.retranslate.push(input);
      return settle({ results: [] });
    },
    approveEntries: async (input: ReviewEntriesInput) => {
      calls.approve.push(input);
      return settle({ results: [] });
    },
    rejectEntries: async () => settle({ results: [] }),
  };
});

const {
  retranslateEntriesHandler,
  reviewApproveManyHandler,
  reviewRejectManyHandler,
  STUDIO_BATCH_LOCK_TIMEOUT_MS,
} = await import("./review-batch.js");

function deps(): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: baseStudioConfig(),
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return { config: loaded, projectRoot: "/project" };
}

beforeEach(() => {
  calls.retranslate = [];
  calls.approve = [];
  calls.failure = undefined;
});

describe("batch handlers: what reaches the sdk", () => {
  it("passes each distinct entry once and bounds the lock wait of a retranslation batch", async () => {
    await retranslateEntriesHandler(
      {
        entries: [
          { locale: "de", key: "a" },
          { locale: "de", key: "a" },
          { locale: "fr", key: "a" },
        ],
      },
      deps(),
    );

    expect(calls.retranslate).toEqual([
      expect.objectContaining({
        entries: [
          { locale: "de", key: "a" },
          { locale: "fr", key: "a" },
        ],
        lockAcquireTimeoutMs: STUDIO_BATCH_LOCK_TIMEOUT_MS,
      }),
    ]);
  });

  it("drops a repeated review entry, keeping the first value the reviewer saw", async () => {
    await reviewApproveManyHandler(
      {
        entries: [
          { locale: "de", key: "a", expectedValue: "first" },
          { locale: "de", key: "a", expectedValue: "second" },
        ],
      },
      deps(),
    );

    expect(calls.approve).toEqual([
      expect.objectContaining({ entries: [{ locale: "de", key: "a", expectedValue: "first" }] }),
    ]);
  });
});

describe("batch handlers: a batch interrupted part way", () => {
  it("answers with the completed outcomes and marks the rest as interrupted", async () => {
    const done = {
      ok: true as const,
      locale: "de",
      key: "a",
      result: { accepted: true as const, value: "A", reviewReasons: [] },
    };
    calls.failure = new BatchInterruptedError(
      [done],
      { locale: "de", key: "b" },
      new Error("EIO sk-ant-api03-abcdefghijklmnopqrstuvwxyz"),
    );

    const result = await retranslateEntriesHandler(
      {
        entries: [
          { locale: "de", key: "a" },
          { locale: "de", key: "b" },
          { locale: "de", key: "c" },
        ],
      },
      deps(),
    );

    expect(result.results[0]).toEqual(done);
    expect(result.results.slice(1)).toEqual([
      expect.objectContaining({ locale: "de", key: "b", ok: false, code: "BATCH_INTERRUPTED" }),
      expect.objectContaining({ locale: "de", key: "c", ok: false, code: "BATCH_INTERRUPTED" }),
    ]);
    expect(JSON.stringify(result)).not.toContain("sk-ant-api03");
  });

  it("surfaces an interrupted review batch the same way", async () => {
    calls.failure = new BatchInterruptedError([], { locale: "de", key: "a" }, new Error("boom"));

    const result = await reviewRejectManyHandler(
      { entries: [{ locale: "de", key: "a", expectedValue: "x" }] },
      deps(),
    );

    expect(result.results).toEqual([
      expect.objectContaining({ key: "a", ok: false, code: "BATCH_INTERRUPTED" }),
    ]);
  });

  it("rethrows any other error", async () => {
    const other = new Error("unexpected");
    calls.failure = other;

    await expect(
      reviewApproveManyHandler(
        { entries: [{ locale: "de", key: "a", expectedValue: "x" }] },
        deps(),
      ),
    ).rejects.toBe(other);
  });
});
