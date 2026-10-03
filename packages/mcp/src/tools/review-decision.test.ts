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

const HASH = "0123456789abcdef";

const SAMPLES: readonly (readonly [string, Record<string, unknown>])[] = [
  ["neither", { locale: "de", key: "greeting", reviewer: "Mario" }],
  ["expectedValue only", PARAMS],
  ["expectedHash only", { locale: "de", key: "greeting", reviewer: "Mario", expectedHash: HASH }],
  ["both", { ...PARAMS, expectedHash: HASH }],
];

interface RequiredClause {
  readonly required: readonly string[];
}

interface ExactlyOneSchema {
  readonly if: RequiredClause;
  readonly then: { readonly not: RequiredClause };
  readonly else: RequiredClause;
}

function holds(clause: RequiredClause, params: object): boolean {
  return clause.required.every((key) => key in params);
}

function satisfiesAdvertised(schema: Readonly<Record<string, unknown>>, params: object): boolean {
  const rule = schema as unknown as ExactlyOneSchema;
  return holds(rule.if, params) ? !holds(rule.then.not, params) : holds(rule.else, params);
}

describe.each([reviewApproveTool, reviewRejectTool])("$name input schema", (tool) => {
  it("advertises that exactly one of expectedValue and expectedHash is required", () => {
    expect(tool.inputSchema.required).toEqual(["locale", "key", "reviewer"]);
    expect(tool.inputSchema).toMatchObject({
      type: "object",
      if: { required: ["expectedValue"] },
      // biome-ignore lint/suspicious/noThenProperty: the JSON Schema if/then/else keyword, never a callable thenable
      then: { not: { required: ["expectedHash"] } },
      else: { required: ["expectedHash"] },
    });
  });

  it("keeps oneOf, anyOf and allOf off the top level, which some model APIs refuse", () => {
    expect(Object.keys(tool.inputSchema)).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/^(oneOf|anyOf|allOf)$/)]),
    );
  });

  it.each(SAMPLES)("agrees with the zod boundary for %s", async (_label, params) => {
    const outcome = await tool.execute(params, makeContext({ cwd: "/nowhere" }));
    const advertisedValid = satisfiesAdvertised(tool.inputSchema, params);

    expect(outcome.kind === "invalid").toBe(!advertisedValid);
    if (!advertisedValid) {
      expect(outcome).toMatchObject({ message: expect.stringContaining("exactly one of") });
    }
  });
});
