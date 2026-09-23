import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { buildWorkbook, readWorkbook } from "@verbatra/exchange";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { check } from "../flow/check.js";
import { diff } from "../flow/diff.js";
import { editEntry } from "../flow/edit-entry.js";
import { keyValue } from "../flow/key-value.js";
import { localeValues } from "../flow/locale-values.js";
import { lockState } from "../flow/lock-state.js";
import { retranslateEntry } from "../flow/retranslate-entry.js";
import { translate } from "../flow/translate-project.js";
import { exportWorkbook } from "../flow/workbook/export-workbook.js";
import { importWorkbook } from "../flow/workbook/import-workbook.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  readTextFile,
  writeJsonFile,
} from "../test-support.js";
import { loadProvenance } from "./load-provenance.js";
import { PROVENANCE_FILE_NAME, type ProvenanceRecord, valueHash } from "./provenance-file.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], ...overrides });

async function project(
  source: Record<string, unknown>,
  target?: Record<string, unknown>,
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  if (target !== undefined) {
    await writeJsonFile(join(dir, "locales", "de.json"), target);
  }
  return dir;
}

async function recordsFor(dir: string, locale = "de"): Promise<Record<string, ProvenanceRecord>> {
  return { ...(await loadProvenance({ cwd: dir })).locales[locale] };
}

async function targetValues(dir: string): Promise<Record<string, string>> {
  return (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
}

const stubCreate = () => makeStubProvider().provider;

async function fillWorkbook(path: string, fills: Readonly<Record<string, string>>): Promise<void> {
  const data = await readWorkbook(new Uint8Array(await readFile(path)));
  const sheets = data.sheets.map((sheet) => ({
    locale: sheet.locale,
    rows: sheet.rows.map((row) =>
      fills[row.key] !== undefined ? { ...row, translation: fills[row.key] as string } : row,
    ),
  }));
  await writeFile(path, await buildWorkbook({ sheets }));
}

describe("provenance: every SDK write path records the origin of what it wrote", () => {
  it("translate records machine output with the configured provider and model", async () => {
    const dir = await project({ greeting: "Hello" });

    await translate({ config: cfg(), cwd: dir }, { createProvider: stubCreate });

    const values = await targetValues(dir);
    expect(await recordsFor(dir)).toEqual({
      greeting: {
        origin: "machine",
        provider: "anthropic",
        model: "test-model",
        valueHash: valueHash(values.greeting ?? ""),
      },
    });
  });

  it("translate records a provider without a model concept by id alone", async () => {
    const dir = await project({ greeting: "Hello" });
    const config = cfg({ provider: { id: "deepl", options: {} } });

    await translate({ config, cwd: dir }, { createProvider: stubCreate });

    expect((await recordsFor(dir)).greeting).toMatchObject({
      origin: "machine",
      provider: "deepl",
    });
    expect((await recordsFor(dir)).greeting?.model).toBeUndefined();
  });

  it("translate records an exact translation-memory hit as memory, and human-only mode does too", async () => {
    const dir = await project({ greeting: "Hello", farewell: "Bye" });
    await translate({ config: cfg(), cwd: dir }, { createProvider: stubCreate });
    await rm(join(dir, "locales", "de.json"));
    await rm(join(dir, PROVENANCE_FILE_NAME));

    await translate({ config: cfg(), cwd: dir }, { createProvider: stubCreate });
    expect((await recordsFor(dir)).greeting?.origin).toBe("memory");

    const humanOnly = cfg({ provider: { id: "none", options: {} } });
    await editEntry({
      config: humanOnly,
      cwd: dir,
      locale: "de",
      key: "farewell",
      value: "Tschau",
    });
    await rm(join(dir, "locales", "de.json"));
    await rm(join(dir, PROVENANCE_FILE_NAME));
    await translate({ config: humanOnly, cwd: dir });
    expect((await recordsFor(dir)).farewell).toEqual({
      origin: "memory",
      valueHash: valueHash("Tschau"),
    });
  });

  it("translate records a fuzzy translation-memory hit as fuzzy", async () => {
    const dir = await project({ greeting: "Welcome to the settings page" });
    const config = cfg({ fuzzyCache: { enabled: true, threshold: 0.8 } });
    await translate({ config, cwd: dir }, { createProvider: stubCreate });
    await writeJsonFile(join(dir, "locales", "en.json"), {
      greeting: "Welcome to the settings page",
      heading: "Welcome to the settings pages",
    });

    const summary = await translate({ config, cwd: dir }, { createProvider: stubCreate });

    expect(summary.locales[0]?.fuzzyHits.map((hit) => hit.key)).toEqual(["heading"]);
    expect((await recordsFor(dir)).heading?.origin).toBe("fuzzy");
    expect((await recordsFor(dir)).greeting?.origin).toBe("machine");
  });

  it("translate records generated plural forms as machine", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), {
      items_one: "{{count}} item",
      items_other: "{{count}} items",
    });

    const summary = await translate(
      { config: baseConfig({ targetLocales: ["pl"] }), cwd: dir, generatePlurals: true },
      { createProvider: stubCreate },
    );

    const generated = summary.locales[0]?.generated ?? [];
    expect(generated.length).toBeGreaterThan(0);
    const records = await recordsFor(dir, "pl");
    for (const key of generated) {
      expect(records[key]).toMatchObject({ origin: "machine", provider: "anthropic" });
    }
  });

  it("editEntry records human by default and agent when the caller says so", async () => {
    const dir = await project({ greeting: "Hello", farewell: "Bye" });

    await editEntry({ config: cfg(), cwd: dir, locale: "de", key: "greeting", value: "Hallo" });
    await editEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "farewell",
      value: "Tschuss",
      actor: "agent",
    });

    expect(await recordsFor(dir)).toEqual({
      farewell: { origin: "agent", valueHash: valueHash("Tschuss") },
      greeting: { origin: "human", valueHash: valueHash("Hallo") },
    });
  });

  it("retranslateEntry records machine output", async () => {
    const dir = await project({ greeting: "Hello" }, { greeting: "Hallo" });

    await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "greeting" },
      { createProvider: stubCreate },
    );

    expect((await recordsFor(dir)).greeting).toMatchObject({
      origin: "machine",
      provider: "anthropic",
      model: "test-model",
      valueHash: valueHash((await targetValues(dir)).greeting ?? ""),
    });
  });

  it("importWorkbook records each accepted row as import", async () => {
    const dir = await project({ greeting: "Hello", farewell: "Bye" });
    const out = await exportWorkbook({ config: cfg(), cwd: dir });
    await fillWorkbook(out.path, { greeting: "Hallo", farewell: "Tschuss" });

    await importWorkbook({ config: cfg(), workbook: out.path, cwd: dir });

    expect(await recordsFor(dir)).toEqual({
      farewell: { origin: "import", valueHash: valueHash("Tschuss") },
      greeting: { origin: "import", valueHash: valueHash("Hallo") },
    });
  });

  it("dry runs and estimates record nothing", async () => {
    const dir = await project({ greeting: "Hello" });

    await translate({ config: cfg(), cwd: dir, dryRun: true }, { createProvider: stubCreate });
    await translate({ config: cfg(), cwd: dir, estimate: true }, { createProvider: stubCreate });

    expect(await readdir(dir)).not.toContain(PROVENANCE_FILE_NAME);
  });
});

describe("provenance: the set of SDK functions that write a locale file is closed", () => {
  const WRITERS_WITH_PROVENANCE = new Map([
    ["flow/locale-run.ts", "translate"],
    ["flow/edit-entry.ts", "editEntry"],
    ["flow/retranslate-entry.ts", "retranslateEntry"],
    ["flow/workbook/import-workbook.ts", "importWorkbook"],
    ["flow/review-decision.ts", "rejectEntry"],
  ]);
  const WRITERS_WITHOUT_PROVENANCE = new Set(["flow/write-target.ts", "flow/pseudo.ts"]);

  async function sourceFiles(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true, recursive: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
      .filter((entry) => !entry.name.endsWith(".test.ts"))
      .map((entry) => join(entry.parentPath, entry.name));
  }

  it("lists every caller of writeTargetResource, so a new write path must be added to the table above", async () => {
    const root = join(import.meta.dirname, "..");
    const callers: string[] = [];
    for (const path of await sourceFiles(root)) {
      if ((await readTextFile(path)).includes("writeTargetResource(")) {
        callers.push(relative(root, path));
      }
    }

    expect(callers.sort()).toEqual(
      [...WRITERS_WITH_PROVENANCE.keys(), ...WRITERS_WITHOUT_PROVENANCE].sort(),
    );
  });

  it("each recorded writer reaches the lock update that requires a provenance patch", async () => {
    const root = join(import.meta.dirname, "..");
    const recorders = ["flow/translate-project.ts", ...WRITERS_WITH_PROVENANCE.keys()].filter(
      (path) => path !== "flow/locale-run.ts",
    );
    for (const path of recorders) {
      expect(await readTextFile(join(root, path))).toMatch(/updateLockFileLocale(Unguarded)?\(/);
    }
    expect(await readTextFile(join(root, "flow/locale-run.ts"))).toContain("settleProvenance(");
  });
});

describe("provenance: readers report the interpreted origin", () => {
  it("check, lockState, diff, keyValue and localeValues all see the same record", async () => {
    const dir = await project({ greeting: "Hello", farewell: "Bye", title: "Title" });
    await translate({ config: cfg(), cwd: dir }, { createProvider: stubCreate });
    await editEntry({ config: cfg(), cwd: dir, locale: "de", key: "farewell", value: "Tschuss" });
    const edited = await targetValues(dir);
    await writeJsonFile(join(dir, "locales", "de.json"), { ...edited, title: "Titel von Hand" });
    await writeJsonFile(join(dir, "locales", "en.json"), {
      greeting: "Hello there",
      farewell: "Bye",
      title: "Title",
    });

    const checked = await check({ config: cfg(), cwd: dir });
    expect(checked.locales[0]?.provenance).toEqual({
      byOrigin: {
        machine: 1,
        memory: 0,
        fuzzy: 0,
        agent: 0,
        human: 1,
        import: 0,
        unknown: 0,
        unrecorded: 0,
        external: 1,
      },
      byReviewState: { unreviewed: 3, approved: 0, rejected: 0 },
    });
    expect((await lockState({ config: cfg(), cwd: dir })).exists).toBe(true);
    const state = await lockState({ config: cfg(), cwd: dir });
    expect(state.exists && state.locales[0]?.provenance).toEqual(checked.locales[0]?.provenance);

    const diffed = await diff({ config: cfg(), cwd: dir });
    expect(diffed.locales[0]?.changedOrigins).toEqual({ greeting: "machine" });

    expect(
      (await keyValue({ config: cfg(), cwd: dir, locale: "de", key: "title" })).provenance,
    ).toEqual({ origin: "external", reviewState: "unreviewed" });
    const values = await localeValues({ config: cfg(), cwd: dir });
    expect(values[0]?.values.farewell?.provenance).toEqual({
      origin: "human",
      reviewState: "unreviewed",
    });
  });

  it("keyValue reports no provenance for a key with no translation", async () => {
    const dir = await project({ greeting: "Hello" });

    const result = await keyValue({ config: cfg(), cwd: dir, locale: "de", key: "greeting" });

    expect(result).toEqual({ source: "Hello" });
  });
});

describe("provenance: a newer or corrupt provenance file", () => {
  it("a file from a newer verbatra is left untouched and reported as a notice", async () => {
    const dir = await project({ greeting: "Hello" });
    const newer = `${JSON.stringify({ version: 99, locales: { de: { greeting: 1 } } })}\n`;
    await writeFile(join(dir, PROVENANCE_FILE_NAME), newer, "utf8");

    const summary = await translate({ config: cfg(), cwd: dir }, { createProvider: stubCreate });

    expect(summary.locales[0]?.notices.map((notice) => notice.code)).toContain(
      "PROVENANCE_VERSION_UNRECOGNIZED",
    );
    expect((await targetValues(dir)).greeting).toBeDefined();
    expect(await readTextFile(join(dir, PROVENANCE_FILE_NAME))).toBe(newer);
  });

  it("importWorkbook reports the same notice for a newer file", async () => {
    const dir = await project({ greeting: "Hello" });
    const out = await exportWorkbook({ config: cfg(), cwd: dir });
    await fillWorkbook(out.path, { greeting: "Hallo" });
    await writeFile(
      join(dir, PROVENANCE_FILE_NAME),
      JSON.stringify({ version: 2, locales: {} }),
      "utf8",
    );

    const summary = await importWorkbook({ config: cfg(), workbook: out.path, cwd: dir });

    expect(summary.locales[0]?.notices.map((notice) => notice.code)).toContain(
      "PROVENANCE_VERSION_UNRECOGNIZED",
    );
  });

  it("a corrupt file fails translate as a whole run before anything is written", async () => {
    const dir = await project({ greeting: "Hello" });
    await writeFile(join(dir, PROVENANCE_FILE_NAME), "{ not json", "utf8");

    await expect(
      translate({ config: cfg(), cwd: dir }, { createProvider: stubCreate }),
    ).rejects.toMatchObject({ code: "PROVENANCE_FILE_INVALID" });
    expect(await readdir(join(dir, "locales"))).toEqual(["en.json"]);
  });
});
