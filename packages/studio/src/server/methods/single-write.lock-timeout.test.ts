import type { LoadedConfig } from "@verbatra/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RpcHandlerDeps } from "../rpc.js";
import { baseStudioConfig } from "../test-support.js";

const calls = vi.hoisted(() => ({ inputs: new Map<string, unknown>() }));

vi.mock("@verbatra/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@verbatra/sdk")>();
  const record =
    (name: string, result: unknown) =>
    async (input: unknown): Promise<unknown> => {
      calls.inputs.set(name, input);
      return result;
    };
  return {
    ...actual,
    approveEntry: record("approveEntry", {}),
    rejectEntry: record("rejectEntry", {}),
    editEntry: record("editEntry", {}),
    retranslateEntry: record("retranslateEntry", {}),
    editConfiguredGlossaryTerm: record("editConfiguredGlossaryTerm", {
      version: 2,
      terms: [],
      doNotTranslate: [],
    }),
  };
});

const { STUDIO_BATCH_LOCK_TIMEOUT_MS } = await import("./review-batch.js");
const { reviewApproveHandler, reviewRejectHandler } = await import("./review-decision.js");
const { editEntryHandler } = await import("./edit-entry.js");
const { retranslateEntryHandler } = await import("./retranslate-entry.js");
const { glossaryWriteHandler } = await import("./glossary.js");

function deps(): RpcHandlerDeps {
  const loaded: LoadedConfig = {
    config: baseStudioConfig(),
    source: { kind: "override" },
    glossary: { source: "file", path: "/project/glossary.json" },
  };
  return { config: loaded, projectRoot: "/project" };
}

beforeEach(() => {
  calls.inputs.clear();
});

describe("single-entry write handlers: the lock wait", () => {
  it.each([
    [
      "approveEntry",
      () => reviewApproveHandler({ locale: "de", key: "a", expectedValue: "A" }, deps()),
    ],
    [
      "rejectEntry",
      () => reviewRejectHandler({ locale: "de", key: "a", expectedValue: "A" }, deps()),
    ],
    ["editEntry", () => editEntryHandler({ locale: "de", key: "a", value: "B" }, deps())],
    ["retranslateEntry", () => retranslateEntryHandler({ locale: "de", key: "a" }, deps())],
    ["editConfiguredGlossaryTerm", () => glossaryWriteHandler({ term: "Cart" }, deps())],
  ])("bounds the lock wait of %s to the Studio timeout", async (name, run) => {
    await run();

    expect(calls.inputs.get(name)).toEqual(
      expect.objectContaining({ lockAcquireTimeoutMs: STUDIO_BATCH_LOCK_TIMEOUT_MS }),
    );
  });
});
