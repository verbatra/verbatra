import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  baseLoadedConfig,
  baseVerbatraConfig,
  makeContext,
  makeProject,
  writeJsonFile,
} from "../test-support.js";
import type { McpToolContext } from "../types.js";
import { editEntryTool } from "./edit-entry.js";
import { reportProvenanceTool } from "./report-provenance.js";

interface ReportLocale {
  readonly locale: string;
  readonly total: number;
  readonly counts: Record<string, number>;
  readonly entries?: readonly { readonly key: string; readonly bucket: string }[];
}

interface Report {
  readonly available: boolean;
  readonly toolVersion?: string;
  readonly sourceLocale?: string;
  readonly locales?: readonly ReportLocale[];
  readonly nextCursor?: string;
}

const SOURCE = Object.fromEntries(Array.from({ length: 5 }, (_, i) => [`key${i}`, `Text ${i}`]));
const TARGET = Object.fromEntries(Object.keys(SOURCE).map((key) => [key, `Wert ${key}`]));

async function projectWithAgentEdit(): Promise<{ dir: string; context: McpToolContext }> {
  const dir = await makeProject(SOURCE, { de: TARGET, fr: TARGET });
  const context = makeContext({
    cwd: dir,
    config: baseLoadedConfig({ config: baseVerbatraConfig({ targetLocales: ["de", "fr"] }) }),
  });
  const edit = await editEntryTool.execute({ locale: "de", key: "key1", value: "Neu" }, context);
  expect(edit.kind).toBe("ok");
  return { dir, context };
}

async function report(params: Record<string, unknown>, context: McpToolContext): Promise<Report> {
  const outcome = await reportProvenanceTool.execute(params, context);
  if (outcome.kind !== "ok") {
    throw new Error(outcome.message);
  }
  return outcome.result as Report;
}

function entryKeys(result: Report): string[] {
  return (result.locales ?? []).flatMap((locale) =>
    (locale.entries ?? []).map((entry) => `${locale.locale}:${entry.key}`),
  );
}

describe("report.provenance", () => {
  it("returns complete counts without entries by default, stamped with the SDK version", async () => {
    const { context } = await projectWithAgentEdit();
    const sdkManifest = JSON.parse(
      await readFile(new URL("../../../sdk/package.json", import.meta.url), "utf8"),
    ) as { readonly version: string };

    const result = await report({}, context);

    expect(result).toMatchObject({
      available: true,
      toolVersion: sdkManifest.version,
      sourceLocale: "en",
    });
    expect(result.locales?.map((locale) => [locale.locale, locale.total])).toEqual([
      ["de", 5],
      ["fr", 5],
    ]);
    expect(result.locales?.[0]?.counts).toMatchObject({ "machine-unreviewed": 1, unrecorded: 4 });
    expect(result.locales?.every((locale) => locale.entries === undefined)).toBe(true);
    expect(result.nextCursor).toBeUndefined();
  });

  it("lists entries of the requested buckets only, keeping every count", async () => {
    const { context } = await projectWithAgentEdit();

    const result = await report({ includeEntries: true, buckets: ["machine-unreviewed"] }, context);

    expect(entryKeys(result)).toEqual(["de:key1"]);
    expect(result.locales?.[0]?.entries?.[0]).toMatchObject({
      bucket: "machine-unreviewed",
      origin: "agent",
    });
    expect(result.locales?.[0]?.counts.unrecorded).toBe(4);
  });

  it("narrows to the requested locales", async () => {
    const { context } = await projectWithAgentEdit();

    const result = await report({ locales: ["fr"] }, context);

    expect(result.locales?.map((locale) => locale.locale)).toEqual(["fr"]);
  });

  it("pages entries in source order, covering every key exactly once", async () => {
    const { context } = await projectWithAgentEdit();
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const result = await report(
        { includeEntries: true, limit: 3, ...(cursor ? { cursor } : {}) },
        context,
      );
      expect(entryKeys(result).length).toBeLessThanOrEqual(3);
      expect(result.locales?.map((locale) => locale.total)).toEqual([5, 5]);
      seen.push(...entryKeys(result));
      cursor = result.nextCursor;
    } while (cursor !== undefined);

    expect(seen).toEqual(
      ["de", "fr"].flatMap((locale) => Object.keys(SOURCE).map((key) => `${locale}:${key}`)),
    );
  });

  it("rejects a cursor once the key it points at is gone", async () => {
    const { dir, context } = await projectWithAgentEdit();
    const first = await report({ includeEntries: true, limit: 3 }, context);
    const { key3: _removed, ...rest } = SOURCE;
    await writeJsonFile(join(dir, "locales", "en.json"), rest);

    const outcome = await reportProvenanceTool.execute(
      { includeEntries: true, limit: 3, cursor: first.nextCursor },
      context,
    );

    expect(outcome).toEqual({
      kind: "invalid",
      message: expect.stringMatching(/^Invalid input for field "cursor": /),
    });
  });

  it("rejects a cursor from other bucket filters", async () => {
    const { context } = await projectWithAgentEdit();
    const first = await report({ includeEntries: true, limit: 3 }, context);

    const outcome = await reportProvenanceTool.execute(
      { includeEntries: true, limit: 3, buckets: ["unrecorded"], cursor: first.nextCursor },
      context,
    );

    expect(outcome.kind).toBe("invalid");
  });

  it("passes an unreadable provenance file through as available: false", async () => {
    const { dir, context } = await projectWithAgentEdit();
    await writeFile(join(dir, "verbatra.provenance.json"), "{ not json", "utf8");

    const result = await report({ includeEntries: true }, context);

    expect(result).toEqual({ available: false, reason: "provenance-unreadable" });
  });

  it.each([
    { limit: 1001 },
    { buckets: [] },
    { buckets: ["machine"] },
    { cursor: "abc" },
    { locales: [] },
  ])("rejects the invalid input %j", async (params) => {
    const outcome = await reportProvenanceTool.execute(params, makeContext());

    expect(outcome.kind).toBe("invalid");
  });
});
