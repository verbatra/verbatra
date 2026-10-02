import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { editEntry, loadProvenance } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import {
  baseVerbatraConfig,
  defaultAdapterRegistry,
  makeContext,
  makeProject,
  nodeFs,
} from "../test-support.js";
import { reviewApproveTool, reviewRejectTool } from "./review-decision.js";

async function agentProject(): Promise<string> {
  const dir = await makeProject({ greeting: "Hello" }, { de: {} });
  await editEntry({
    config: baseVerbatraConfig(),
    cwd: dir,
    locale: "de",
    key: "greeting",
    value: "Hallo",
    actor: "agent",
  });
  return dir;
}

const PARAMS = { locale: "de", key: "greeting", expectedValue: "Hallo", reviewer: "Mario" };

describe("review.approve", () => {
  it("records the approval with the named reviewer in the provenance file", async () => {
    const dir = await agentProject();

    const outcome = await reviewApproveTool.execute(
      PARAMS,
      makeContext({ cwd: dir, fs: nodeFs, adapterRegistry: defaultAdapterRegistry }),
    );

    expect(outcome).toEqual({
      kind: "ok",
      result: {
        locale: "de",
        key: "greeting",
        provenance: { origin: "agent", reviewState: "approved", reviewer: "Mario" },
      },
    });
    expect((await loadProvenance({ cwd: dir })).locales.de?.greeting).toMatchObject({
      reviewState: "approved",
      reviewer: "Mario",
    });
  });

  it("refuses a value the user did not review with REVIEW_VALUE_CHANGED", async () => {
    const dir = await agentProject();

    const outcome = await reviewApproveTool.execute(
      { ...PARAMS, expectedValue: "Servus" },
      makeContext({ cwd: dir }),
    );

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining("REVIEW_VALUE_CHANGED"),
    });
  });

  it.each([
    ["no reviewer", { locale: "de", key: "greeting", expectedValue: "Hallo" }],
    ["an empty reviewer", { ...PARAMS, reviewer: "" }],
    ["a reviewer over 64 characters", { ...PARAMS, reviewer: "x".repeat(65) }],
    ["an unknown parameter", { ...PARAMS, bogus: true }],
  ])("rejects %s as invalid input", async (_name, params) => {
    const outcome = await reviewApproveTool.execute(params, makeContext());

    expect(outcome.kind).toBe("invalid");
  });
});

describe("review.reject", () => {
  it("removes the value and records the rejection", async () => {
    const dir = await agentProject();

    const outcome = await reviewRejectTool.execute(PARAMS, makeContext({ cwd: dir }));

    expect(outcome).toEqual({
      kind: "ok",
      result: {
        locale: "de",
        key: "greeting",
        provenance: { origin: "agent", reviewState: "rejected", reviewer: "Mario" },
      },
    });
    expect(JSON.parse(await readFile(join(dir, "locales", "de.json"), "utf8"))).toEqual({});
    expect((await loadProvenance({ cwd: dir })).locales.de?.greeting?.reviewState).toBe("rejected");
  });

  it("refuses a value the user did not review, removing nothing", async () => {
    const dir = await agentProject();

    const outcome = await reviewRejectTool.execute(
      { ...PARAMS, expectedValue: "Servus" },
      makeContext({ cwd: dir }),
    );

    expect(outcome).toMatchObject({
      kind: "error",
      message: expect.stringContaining("REVIEW_VALUE_CHANGED"),
    });
    expect(JSON.parse(await readFile(join(dir, "locales", "de.json"), "utf8"))).toEqual({
      greeting: "Hallo",
    });
  });
});
