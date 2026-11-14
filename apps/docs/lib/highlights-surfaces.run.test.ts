import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  type CheckSummary,
  type CreateProvider,
  check,
  type PlaceholderIntegrityResult,
  translate,
  type VerbatraConfig,
} from "@verbatra/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { HERO_TERMINAL_LOCALES, HERO_TERMINAL_SOURCE } from "@/lib/hero-terminal";
import {
  CLI_LINES,
  MCP_CALL,
  MCP_RESPONSE_LINES,
  RAIL_ENTRIES,
  SDK_CALL_LINES,
  SDK_RESULT_LINES,
  STUDIO_ROW,
  SURFACE_COUNTS,
  SURFACE_COVERAGE_PERCENT,
  surfaceText,
} from "@/lib/highlights-surfaces";
import { LOCK_DEMO_HASHES } from "@/lib/lock-demo";
import { renderCheckHuman } from "../../../packages/cli/src/render";
import { makeContext } from "../../../packages/mcp/src/test-support";
import { statusCheckTool } from "../../../packages/mcp/src/tools/status-check";
import { coveragePercent } from "../../../packages/studio/src/client/coverage";

const CONFIG: VerbatraConfig = {
  sourceLocale: "en",
  targetLocales: HERO_TERMINAL_LOCALES.map(({ locale }) => locale),
  format: "next-intl-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "anthropic", options: { model: "stub", maxTokens: 256 } },
};

const PASS: PlaceholderIntegrityResult = {
  matches: true,
  missing: [],
  extra: [],
  reordered: false,
};

const provider: CreateProvider = () => ({
  id: "stub",
  kind: "llm",
  supportsGlossary: true,
  translateBatch: async (request) => ({
    values: new Map(request.entries.map((entry) => [entry.key, `${entry.value} (t)`])),
    integrity: new Map(request.entries.map((entry) => [entry.key, PASS])),
  }),
});

function sourceFile(edited: boolean): string {
  const tree: Record<string, Record<string, string>> = {};
  for (const { key, value, before } of HERO_TERMINAL_SOURCE) {
    const [group, leaf] = key.split(".") as [string, string];
    tree[group] = { ...tree[group], [leaf]: edited ? value : (before ?? value) };
  }
  return JSON.stringify(tree, null, 2);
}

let cwd: string | undefined;

afterEach(async () => {
  if (cwd) await rm(cwd, { recursive: true, force: true });
  cwd = undefined;
});

async function projectWithEditedKeys(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "verbatra-docs-surfaces-"));
  cwd = dir;
  await mkdir(join(dir, "locales"));
  await writeFile(join(dir, "locales/en.json"), sourceFile(false));
  await translate({ config: CONFIG, cwd: dir }, { createProvider: provider });
  await writeFile(join(dir, "locales/en.json"), sourceFile(true));
  return dir;
}

function localeOf(summary: CheckSummary): Record<string, unknown> {
  const [first] = summary.locales;
  if (first === undefined) throw new Error("check returned no locale");
  return { ...first };
}

function elided(text: string): string {
  return text.replace(/,\s*\.\.\./, "");
}

function sdkObject(): Record<string, unknown> {
  const body = SDK_RESULT_LINES.map(({ text }) => text.replace(/^\/\/ ?/, "")).join("\n");
  return new Function(`return (${elided(body)});`)() as Record<string, unknown>;
}

describe("the four surfaces print what verbatra returns", () => {
  it("counts the same keys the real check counts, and the dataset stays 14 keys, de, 2 stale", async () => {
    const summary = await check({ config: CONFIG, cwd: await projectWithEditedKeys() });
    const real = localeOf(summary);
    expect(SURFACE_COUNTS).toEqual({
      locale: real.locale,
      missing: real.missing,
      stale: real.stale,
      upToDate: real.upToDate,
      total: HERO_TERMINAL_SOURCE.length,
    });
    expect(SURFACE_COUNTS).toMatchObject({
      locale: "de",
      missing: 0,
      stale: 2,
      upToDate: 12,
      total: 14,
    });
  });

  it("prints the check lines the CLI renders, after the command", async () => {
    const summary = await check({ config: CONFIG, cwd: await projectWithEditedKeys() });
    expect(CLI_LINES.map(({ text }) => text)).toEqual([
      "$ npx @verbatra/cli check",
      ...renderCheckHuman(summary).split("\n"),
    ]);
    for (const line of CLI_LINES) if (line.hit) expect(line.text).toContain(line.hit);
  });

  it("shows the call check() takes and fields its summary really carries", async () => {
    const summary = await check({ config: CONFIG, cwd: await projectWithEditedKeys() });
    const real = localeOf(summary);
    expect(SDK_CALL_LINES.map(({ text }) => text)).toEqual([
      'import { check } from "@verbatra/sdk";',
      "const summary = await check({ config });",
      "summary.locales[0];",
    ]);
    const shown = sdkObject();
    expect(Object.keys(shown).length).toBeGreaterThan(0);
    for (const [key, value] of Object.entries(shown)) expect(real[key], key).toEqual(value);
    expect(Object.keys(real).length).toBeGreaterThan(Object.keys(shown).length);
    expect(SDK_RESULT_LINES.some(({ text }) => text.includes("..."))).toBe(true);
  });

  it("prints the status.check call and the response the real tool returns", async () => {
    const dir = await projectWithEditedKeys();
    const base = makeContext();
    const outcome = await statusCheckTool.execute(
      {},
      { ...base, cwd: dir, config: { ...base.config, config: CONFIG } },
    );
    if (outcome.kind !== "ok") throw new Error(`status.check did not run: ${outcome.kind}`);
    expect(MCP_CALL).toBe(`${statusCheckTool.name}({})`);
    const shown = JSON.parse(elided(MCP_RESPONSE_LINES.map(({ text }) => text).join("\n")));
    const result = outcome.result as { inSync: boolean; locales: Array<Record<string, unknown>> };
    expect(shown.inSync).toBe(result.inSync);
    expect(shown.locales).toHaveLength(result.locales.length);
    for (const [index, locale] of shown.locales.entries())
      for (const [key, value] of Object.entries(locale))
        expect(result.locales[index]?.[key], key).toEqual(value);
    expect(statusCheckTool.annotations.readOnlyHint).toBe(true);
    expect(MCP_RESPONSE_LINES.some(({ text }) => text.includes("..."))).toBe(true);
  });

  it("marks the stale field in every pane with the stale count itself", () => {
    const hits = [...CLI_LINES, ...SDK_RESULT_LINES, ...MCP_RESPONSE_LINES].filter(
      ({ hit }) => hit !== undefined,
    );
    expect(hits).toHaveLength(3);
    for (const line of hits) expect(line.hit).toMatch(new RegExp(`\\b${SURFACE_COUNTS.stale}\\b`));
  });

  it("draws the Studio Locales row with the figures and the coverage rule Studio uses", async () => {
    const summary = await check({ config: CONFIG, cwd: await projectWithEditedKeys() });
    const real = localeOf(summary) as { missing: number; stale: number; upToDate: number };
    expect(SURFACE_COVERAGE_PERCENT).toBe(coveragePercent(real));
    expect(STUDIO_ROW).toEqual({
      locale: "de",
      percent: coveragePercent(real),
      keys: "12 / 14 keys",
      missing: 0,
      stale: 2,
      upToDate: 12,
    });
    const studio = await readFile(
      join(import.meta.dirname, "../../../packages/studio/src/app/LocalesSection.tsx"),
      "utf8",
    );
    for (const label of ["Locale", "Coverage", "Missing", "Stale", "Up to date"])
      expect(studio).toContain(label);
    expect(studio).toContain("{formatCount(row.upToDate)} / {formatCount(total)} keys");
  });

  it("lists the stale entries the lock file records, with the old hashes", () => {
    expect(RAIL_ENTRIES.map(({ key }) => key)).toEqual(["checkout.pay", "checkout.title"]);
    for (const { key, hash } of RAIL_ENTRIES) expect(hash).toBe(LOCK_DEMO_HASHES[key]?.before);
  });

  it("flattens a line list to the text the page prints", () => {
    expect(surfaceText(CLI_LINES)).toBe(CLI_LINES.map(({ text }) => text).join("\n"));
  });
});
