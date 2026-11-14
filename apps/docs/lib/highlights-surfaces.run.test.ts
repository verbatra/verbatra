import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { type CheckSummary, check, translate } from "@verbatra/sdk";
import { afterEach, describe, expect, it } from "vitest";
import { HERO_TERMINAL_SOURCE } from "@/lib/hero-terminal";
import {
  CLI_LINES,
  LOCK_STATE_STALE,
  MCP_CALL,
  MCP_RESPONSE_LINES,
  RAIL_ENTRIES,
  SDK_CALL_LINES,
  SDK_RESULT_LINES,
  STUDIO_COLUMNS,
  STUDIO_ROW,
  SURFACE_BADGES,
  SURFACE_COUNTS,
  surfaceText,
} from "@/lib/highlights-surfaces";
import { LOCK_DEMO_HASHES } from "@/lib/lock-demo";
import {
  fixtureConfig,
  removeProject,
  sourceFile,
  stubProvider,
  tempProject,
  writeSource,
} from "@/test-support/run-fixture";
import { renderCheckHuman } from "../../../packages/cli/src/render";
import { makeContext } from "../../../packages/mcp/src/test-support";
import { buildToolRegistry } from "../../../packages/mcp/src/tools/registry";
import { statusCheckTool } from "../../../packages/mcp/src/tools/status-check";
import { coveragePercent } from "../../../packages/studio/src/client/coverage";

const CONFIG = fixtureConfig();

let cwd: string | undefined;

afterEach(async () => {
  await removeProject(cwd);
  cwd = undefined;
});

async function projectWithEditedKeys(): Promise<string> {
  const dir = await tempProject("verbatra-docs-surfaces-");
  cwd = dir;
  await writeSource(
    dir,
    sourceFile(({ value, before }) => before ?? value),
  );
  await translate({ config: CONFIG, cwd: dir }, { createProvider: stubProvider() });
  await writeSource(
    dir,
    sourceFile(({ value }) => value),
  );
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

  it("shows a call that runs against the real check and returns the object it prints", async () => {
    const dir = await projectWithEditedKeys();
    const summary = await check({ config: CONFIG, cwd: dir });
    const real = localeOf(summary);
    const [importLine, ...statements] = SDK_CALL_LINES.map(({ text }) => text);
    expect(importLine).toBe('import { check } from "@verbatra/sdk";');
    const [call, access] = statements as [string, string];
    const AsyncFunction = Object.getPrototypeOf(async () => undefined).constructor as new (
      ...args: string[]
    ) => (...values: unknown[]) => Promise<unknown>;
    const execute = new AsyncFunction("check", "config", `${call}\nreturn ${access}`);
    const calls: unknown[] = [];
    const returned = await execute((input: { config: typeof CONFIG }) => {
      calls.push(input);
      return check({ ...input, cwd: dir });
    }, CONFIG);
    expect(calls).toHaveLength(1);
    expect(returned).toEqual(real);
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
    const spending = buildToolRegistry(true)
      .filter((tool) => !buildToolRegistry(false).includes(tool))
      .map((tool) => tool.name);
    expect(spending.length).toBeGreaterThan(0);
    expect(spending).not.toContain(statusCheckTool.name);
    expect(buildToolRegistry(false).map((tool) => tool.name)).toContain(statusCheckTool.name);
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
    const coverage = studio.slice(studio.indexOf('aria-label="Locale coverage"'));
    const head = coverage.slice(0, coverage.indexOf("</TableHead>"));
    const labels = [
      ...head.matchAll(/<TableHeaderCell[^>]*>\s*([^<]+?)\s*<\/TableHeaderCell>/g),
    ].map((match) => match[1]);
    expect(labels).toEqual([...STUDIO_COLUMNS, "Lock", "Open"]);
    expect(studio).toContain("{formatCount(row.upToDate)} / {formatCount(total)} keys");
    expect(STUDIO_ROW.keys).toBe(`${SURFACE_COUNTS.upToDate} / ${SURFACE_COUNTS.total} keys`);
  });

  it("names each pane badge after what the surface really is", async () => {
    const cli = await readFile(
      join(import.meta.dirname, "../../../packages/cli/src/run.ts"),
      "utf8",
    );
    const program = /\.name\("([^"]+)"\)/.exec(cli)?.[1];
    expect(program).toBeDefined();
    expect(cli).toContain('.command("check")');
    expect(SURFACE_BADGES.cli).toBe(`${program} check`);
    const studio = await readFile(
      join(import.meta.dirname, "../../../packages/studio/src/app/LocalesSection.tsx"),
      "utf8",
    );
    const section = /export function LocalesSection[\s\S]*?title="([^"]+)"/.exec(studio)?.[1];
    expect(section).toBeDefined();
    expect(SURFACE_BADGES.studio).toBe(section);
    expect(SURFACE_BADGES.sdk).toBe(`${check.name}()`);
  });

  it("lists the stale entries the lock file records, with the old hashes", () => {
    expect(RAIL_ENTRIES.map(({ key }) => key)).toEqual(["checkout.pay", "checkout.title"]);
    for (const { key, hash } of RAIL_ENTRIES) expect(hash).toBe(LOCK_DEMO_HASHES[key]?.before);
  });

  it("prints the lock state word the check output prints, and nothing else for the rail tag", async () => {
    const summary = await check({ config: CONFIG, cwd: await projectWithEditedKeys() });
    expect(renderCheckHuman(summary)).toContain(`${SURFACE_COUNTS.stale} ${LOCK_STATE_STALE}`);
  });

  it("flattens a line list to the text the page prints", () => {
    expect(surfaceText(CLI_LINES)).toBe(CLI_LINES.map(({ text }) => text).join("\n"));
  });
});
