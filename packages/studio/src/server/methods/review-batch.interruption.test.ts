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
  reject: [] as unknown[],
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
    rejectEntries: async (input: ReviewEntriesInput) => {
      calls.reject.push(input);
      return settle({ results: [] });
    },
  };
});

const {
  retranslateEntriesHandler,
  reviewApproveManyHandler,
  reviewRejectManyHandler,
  STUDIO_BATCH_LOCK_TIMEOUT_MS,
} = await import("./review-batch.js");

function deps(log?: (line: string) => void): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: baseStudioConfig(),
    source: { kind: "override" },
    glossary: { source: "none" },
  };
  return { config: loaded, projectRoot: "/project", ...(log !== undefined ? { log } : {}) };
}

beforeEach(() => {
  calls.retranslate = [];
  calls.approve = [];
  calls.reject = [];
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

  it("bounds the lock wait of an approval and a rejection batch", async () => {
    const params = { entries: [{ locale: "de", key: "a", expectedValue: "A" }] };

    await reviewApproveManyHandler(params, deps());
    await reviewRejectManyHandler(params, deps());

    for (const recorded of [calls.approve, calls.reject]) {
      expect(recorded).toEqual([
        expect.objectContaining({ lockAcquireTimeoutMs: STUDIO_BATCH_LOCK_TIMEOUT_MS }),
      ]);
    }
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
      new Error("EIO /home/me/project/locales/de.json sk-ant-api03-abcdefghijklmnopqrstuvwxyz"),
    );
    const logged: string[] = [];

    const result = await retranslateEntriesHandler(
      {
        entries: [
          { locale: "de", key: "a" },
          { locale: "de", key: "b" },
          { locale: "de", key: "c" },
        ],
      },
      deps((line) => logged.push(line)),
    );

    expect(result.results[0]).toEqual(done);
    expect(result.results.slice(1)).toEqual(
      ["b", "c"].map((key) => ({
        locale: "de",
        key,
        ok: false,
        code: "BATCH_INTERRUPTED",
        message: "The batch stopped before this entry because of an unexpected server error.",
      })),
    );
    expect(JSON.stringify(result)).not.toContain("EIO");
    expect(JSON.stringify(result)).not.toContain("/home/me");
    expect(JSON.stringify(result)).not.toContain("sk-ant-api03");
    expect(logged).toEqual([
      'studio error: translation.retranslateEntries stopped at "b" in de after 1 completed: ' +
        "EIO /home/me/project/locales/de.json [REDACTED]",
    ]);
  });

  it("neutralizes control characters in the logged line and logs a non-error cause", async () => {
    calls.failure = new BatchInterruptedError(
      [],
      { locale: "de", key: "a\u001b[2Jb" },
      "raw\nfailure",
    );
    const logged: string[] = [];

    await reviewApproveManyHandler(
      { entries: [{ locale: "de", key: "a", expectedValue: "x" }] },
      deps((line) => logged.push(line)),
    );

    expect(logged).toHaveLength(1);
    expect(logged[0]).toContain("review.approveMany");
    expect(logged[0]).toContain("raw failure");
    expect(logged[0]).not.toMatch(/\p{Cc}/u);
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
