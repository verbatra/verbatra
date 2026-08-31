import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildDelimited, buildWorkbook, readDelimited, readWorkbook } from "@verbatra/exchange";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../../config/schema.js";
import { defaultFs } from "../../fs.js";
import {
  baseConfig,
  makeFakeFs,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../../test-support.js";
import { exportWorkbook } from "./export-workbook.js";
import { importWorkbook } from "./import-workbook.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de", "fr"], format: "i18next-json", ...overrides });

async function project(
  source: Record<string, unknown>,
  targets: Record<string, Record<string, unknown> | undefined> = {},
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  for (const [locale, obj] of Object.entries(targets)) {
    if (obj !== undefined) {
      await writeJsonFile(join(dir, "locales", `${locale}.json`), obj);
    }
  }
  return dir;
}

async function readExported(path: string, locale: string, format: "csv" | "tsv") {
  return readDelimited({ text: await readFile(path, "utf8"), locale, format });
}

async function fillExported(
  path: string,
  locale: string,
  format: "csv" | "tsv",
  fills: Readonly<Record<string, string>>,
): Promise<void> {
  const data = await readExported(path, locale, format);
  const sheet = data.sheets[0];
  if (sheet === undefined) {
    throw new Error("expected one sheet");
  }
  const rows = sheet.rows.map((row) =>
    fills[row.key] !== undefined ? { ...row, translation: fills[row.key] as string } : row,
  );
  await writeFile(path, buildDelimited({ locale, rows }, format), "utf8");
}

describe("exportWorkbook: delimited formats", () => {
  it("writes one csv per target locale, each opening with the header line", async () => {
    const dir = await project(
      { greeting: "Hello", farewell: "Bye" },
      { de: { greeting: "Hallo" } },
    );
    const result = await exportWorkbook({ config: cfg(), cwd: dir, format: "csv", out: "handoff" });

    expect(result.path).toBe(join(dir, "handoff"));
    expect(result.locales.map((l) => l.locale)).toEqual(["de", "fr"]);

    const de = await readFile(join(dir, "handoff", "de.csv"), "utf8");
    expect(de.charCodeAt(0)).toBe(0xfeff);
    expect(de.slice(1).split("\n")[0]).toBe(
      "Key,Source,Current translation,Status,Translation,Source hash,Context,Review status,Review reasons",
    );
    const parsed = await readExported(join(dir, "handoff", "de.csv"), "de", "csv");
    expect(parsed.sheets[0]?.rows.map((r) => r.key)).toEqual(["farewell"]);
    const fr = await readExported(join(dir, "handoff", "fr.csv"), "fr", "csv");
    expect(fr.sheets[0]?.rows.map((r) => r.key)).toEqual(["farewell", "greeting"]);
  });

  it("writes the same rows with a tab delimiter for tsv, from the same code path", async () => {
    const dir = await project({ greeting: "Hello, world" }, {});
    await exportWorkbook({ config: cfg(), cwd: dir, format: "csv", out: "csv-out" });
    await exportWorkbook({ config: cfg(), cwd: dir, format: "tsv", out: "tsv-out" });

    const csv = await readExported(join(dir, "csv-out", "de.csv"), "de", "csv");
    const tsv = await readExported(join(dir, "tsv-out", "de.tsv"), "de", "tsv");
    expect(tsv.sheets).toEqual(csv.sheets);
    expect(await readFile(join(dir, "tsv-out", "de.tsv"), "utf8")).toContain("\tHello, world\t");
  });

  it("creates the output directory, including a missing parent", async () => {
    const dir = await project({ a: "A" });
    const result = await exportWorkbook({
      config: cfg(),
      cwd: dir,
      format: "csv",
      out: join("nested", "handoff"),
    });
    expect(result.path).toBe(join(dir, "nested", "handoff"));
    await expect(readFile(join(result.path, "de.csv"), "utf8")).resolves.toContain("Key,Source");
  });

  it("defaults to a verbatra-translations directory when no out path is given", async () => {
    const dir = await project({ a: "A" });
    const result = await exportWorkbook({ config: cfg(), cwd: dir, format: "csv" });
    expect(result.path).toBe(join(dir, "verbatra-translations"));
    await expect(readFile(join(result.path, "fr.csv"), "utf8")).resolves.toContain("Key,Source");
  });

  it("writes through a custom file system that implements no mkdir", async () => {
    const dir = await project({ a: "A" });
    const written = new Map<string, string>();
    const fakeFs = makeFakeFs({
      fileExists: defaultFs.fileExists,
      readFileBounded: defaultFs.readFileBounded,
      writeFile: async (path: string, data: string): Promise<void> => {
        written.set(path, data);
      },
    });

    const result = await exportWorkbook(
      { config: cfg({ targetLocales: ["de"] }), cwd: dir, format: "csv", out: "handoff" },
      { fs: fakeFs },
    );

    expect(result.path).toBe(join(dir, "handoff"));
    expect([...written.keys()]).toEqual([
      join(dir, "handoff", "de.csv"),
      join(dir, "handoff", ".verbatra-export-csv.json"),
    ]);
    expect(written.get(join(dir, "handoff", "de.csv"))).toContain("Key,Source");
  });

  it("records the exported locales in a per-format manifest, written after the locale files", async () => {
    const dir = await project({ a: "A" });
    await exportWorkbook({ config: cfg(), cwd: dir, format: "csv", out: "handoff" });
    await exportWorkbook({ config: cfg(), cwd: dir, format: "tsv", out: "handoff" });

    expect(await readJsonFile(join(dir, "handoff", ".verbatra-export-csv.json"))).toEqual({
      version: 1,
      format: "csv",
      locales: ["de", "fr"],
    });
    expect(await readJsonFile(join(dir, "handoff", ".verbatra-export-tsv.json"))).toEqual({
      version: 1,
      format: "tsv",
      locales: ["de", "fr"],
    });
  });

  it("leaves an unrelated file in the output directory untouched when the selection narrows", async () => {
    const dir = await project({ a: "A" });
    await exportWorkbook({ config: cfg(), cwd: dir, format: "csv", out: "handoff" });
    await writeFile(join(dir, "handoff", "notes.txt"), "translator notes", "utf8");

    await exportWorkbook({
      config: cfg(),
      cwd: dir,
      format: "csv",
      out: "handoff",
      locales: ["de"],
    });

    expect(await readFile(join(dir, "handoff", "notes.txt"), "utf8")).toBe("translator notes");
    await expect(readFile(join(dir, "handoff", "fr.csv"), "utf8")).resolves.toContain("Key,Source");
  });

  it("writes the xlsx workbook when no format is passed", async () => {
    const dir = await project({ a: "A" });
    const result = await exportWorkbook({ config: cfg(), cwd: dir });
    expect(result.path).toBe(join(dir, "verbatra-translations.xlsx"));
    const data = await readWorkbook(new Uint8Array(await readFile(result.path)));
    expect(data.sheets.map((s) => s.locale)).toEqual(["de", "fr"]);
  });
});

describe("importWorkbook: delimited formats", () => {
  it("imports every recognized locale file in a directory", async () => {
    const dir = await project({ greeting: "Hello" });
    await exportWorkbook({ config: cfg(), cwd: dir, format: "csv", out: "handoff" });
    await fillExported(join(dir, "handoff", "de.csv"), "de", "csv", { greeting: "Hallo" });
    await fillExported(join(dir, "handoff", "fr.csv"), "fr", "csv", { greeting: "Bonjour" });

    const summary = await importWorkbook({
      config: cfg(),
      cwd: dir,
      workbook: "handoff",
      format: "csv",
    });
    expect(summary.failed).toEqual([]);
    expect(summary.locales.map((l) => l.translated)).toEqual([["greeting"], ["greeting"]]);
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ greeting: "Hallo" });
    expect(await readJsonFile(join(dir, "locales", "fr.json"))).toEqual({ greeting: "Bonjour" });
  });

  it("imports a single interchange file, taking the locale from its file name", async () => {
    const dir = await project({ greeting: "Hello" });
    await exportWorkbook({
      config: cfg({ targetLocales: ["de"] }),
      cwd: dir,
      format: "tsv",
      out: "handoff",
    });
    await fillExported(join(dir, "handoff", "de.tsv"), "de", "tsv", { greeting: "Hallo" });

    const summary = await importWorkbook({
      config: cfg({ targetLocales: ["de"] }),
      cwd: dir,
      workbook: join("handoff", "de.tsv"),
      format: "tsv",
    });
    expect(summary.failed).toEqual([]);
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ greeting: "Hallo" });
  });

  it("imports a single interchange file for one of several target locales, without failing the other", async () => {
    const dir = await project({ greeting: "Hello" });
    await exportWorkbook({
      config: cfg({ targetLocales: ["de"] }),
      cwd: dir,
      format: "tsv",
      out: "handoff",
    });
    await fillExported(join(dir, "handoff", "de.tsv"), "de", "tsv", { greeting: "Hallo" });

    const summary = await importWorkbook({
      config: cfg({ targetLocales: ["de", "fr"] }),
      cwd: dir,
      workbook: join("handoff", "de.tsv"),
      format: "tsv",
    });
    expect(summary.failed).toEqual([]);
    expect(summary.locales.map((l) => l.locale)).toEqual(["de"]);
    expect(summary.locales.find((l) => l.locale === "de")?.translated).toEqual(["greeting"]);
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ greeting: "Hallo" });
  });

  it("reports a configured locale with no interchange file as a missing-sheet failure", async () => {
    const dir = await project({ greeting: "Hello" });
    await exportWorkbook({ config: cfg(), cwd: dir, format: "csv", out: "handoff" });
    await fillExported(join(dir, "handoff", "de.csv"), "de", "csv", { greeting: "Hallo" });
    await rm(join(dir, "handoff", "fr.csv"));

    const summary = await importWorkbook({
      config: cfg(),
      cwd: dir,
      workbook: "handoff",
      format: "csv",
    });
    const fr = summary.locales.find((locale) => locale.locale === "fr");
    expect(fr?.error?.code).toBe("WORKBOOK_SHEET_MISSING");
    expect(fr?.error?.message).toContain("fr.csv");
    expect(summary.locales.find((locale) => locale.locale === "de")?.translated).toEqual([
      "greeting",
    ]);
  });

  it("fails the whole run when one interchange file is structurally invalid", async () => {
    const dir = await project({ greeting: "Hello" });
    await exportWorkbook({ config: cfg(), cwd: dir, format: "csv", out: "handoff" });
    await writeFile(join(dir, "handoff", "fr.csv"), "not,a,header\n", "utf8");

    const error: unknown = await importWorkbook({
      config: cfg(),
      cwd: dir,
      workbook: "handoff",
      format: "csv",
    }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "SOURCE_INVALID" });
    expect((error as Error).message).not.toContain("Hello");
  });

  it("fails the run when the path is neither a readable file nor a directory of locale files", async () => {
    const dir = await project({ greeting: "Hello" });
    const error: unknown = await importWorkbook({
      config: cfg(),
      cwd: dir,
      workbook: "nowhere",
      format: "csv",
    }).catch((caught: unknown) => caught);
    expect(error).toMatchObject({ code: "SOURCE_UNREADABLE" });
  });

  it("rejects a file whose name is not a configured target locale", async () => {
    const dir = await project({ greeting: "Hello" });
    await exportWorkbook({ config: cfg(), cwd: dir, format: "csv", out: "handoff" });
    const text = await readFile(join(dir, "handoff", "de.csv"), "utf8");
    await writeFile(join(dir, "handoff", "handoff.csv"), text, "utf8");

    const summary = await importWorkbook({
      config: cfg(),
      cwd: dir,
      workbook: join("handoff", "handoff.csv"),
      format: "csv",
    });
    expect(summary.locales[0]?.error?.code).toBe("CONFIG_INVALID");
  });
});

describe("delimited handoff: a narrower re-export retires the locales it dropped", () => {
  const wide = cfg({ targetLocales: ["de", "fr", "es"] });

  async function exportedWideHandoff(dir: string): Promise<void> {
    await exportWorkbook({ config: wide, cwd: dir, format: "csv", out: "handoff" });
    await fillExported(join(dir, "handoff", "de.csv"), "de", "csv", { greeting: "Hallo" });
    await fillExported(join(dir, "handoff", "fr.csv"), "fr", "csv", { greeting: "Bonjour" });
    await fillExported(join(dir, "handoff", "es.csv"), "es", "csv", { greeting: "Hola" });
  }

  const manifestPath = (dir: string): string => join(dir, "handoff", ".verbatra-export-csv.json");

  const importHandoff = async (dir: string, dryRun = false) =>
    importWorkbook({ config: wide, cwd: dir, workbook: "handoff", format: "csv", dryRun });

  it("rejects a leftover locale file from a wider earlier export instead of applying it", async () => {
    const dir = await project({ greeting: "Hello" });
    await exportedWideHandoff(dir);

    await exportWorkbook({
      config: wide,
      cwd: dir,
      format: "csv",
      out: "handoff",
      locales: ["de"],
    });
    await fillExported(join(dir, "handoff", "de.csv"), "de", "csv", { greeting: "Hallo" });

    const summary = await importHandoff(dir);

    const stale = (locale: string) => summary.locales.find((entry) => entry.locale === locale);
    expect(stale("fr")?.error?.code).toBe("HANDOFF_FILE_STALE");
    expect(stale("fr")?.error?.message).toContain("fr.csv");
    expect(stale("es")?.error?.code).toBe("HANDOFF_FILE_STALE");
    expect(summary.failed).toEqual(["fr", "es"]);
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ greeting: "Hallo" });
    await expect(readFile(join(dir, "locales", "fr.json"), "utf8")).rejects.toThrow();
    await expect(readFile(join(dir, "locales", "es.json"), "utf8")).rejects.toThrow();
  });

  it("reports every locale as stale, without failing the run, when no file is current", async () => {
    const dir = await project({ greeting: "Hello" });
    await exportedWideHandoff(dir);
    await writeJsonFile(manifestPath(dir), { version: 1, format: "csv", locales: [] });

    const summary = await importHandoff(dir);

    expect(summary.failed).toEqual(["de", "fr", "es"]);
    expect(summary.locales.map((entry) => entry.error?.code)).toEqual([
      "HANDOFF_FILE_STALE",
      "HANDOFF_FILE_STALE",
      "HANDOFF_FILE_STALE",
    ]);
    await expect(readFile(join(dir, "locales", "de.json"), "utf8")).rejects.toThrow();
  });

  it("rejects a stale file on a dry run too, and still writes nothing", async () => {
    const dir = await project({ greeting: "Hello" });
    await exportedWideHandoff(dir);
    await writeJsonFile(manifestPath(dir), { version: 1, format: "csv", locales: ["de"] });

    const summary = await importHandoff(dir, true);

    expect(summary.dryRun).toBe(true);
    expect(summary.locales.find((entry) => entry.locale === "de")?.translated).toEqual([
      "greeting",
    ]);
    expect(summary.locales.find((entry) => entry.locale === "fr")?.error?.code).toBe(
      "HANDOFF_FILE_STALE",
    );
    await expect(readFile(join(dir, "locales", "de.json"), "utf8")).rejects.toThrow();
  });

  it("takes a directly named file at face value, even for a locale the manifest dropped", async () => {
    const dir = await project({ greeting: "Hello" });
    await exportedWideHandoff(dir);
    await writeJsonFile(manifestPath(dir), { version: 1, format: "csv", locales: ["de"] });

    const summary = await importWorkbook({
      config: wide,
      cwd: dir,
      workbook: join("handoff", "fr.csv"),
      format: "csv",
    });

    expect(summary.locales[0]?.translated).toEqual(["greeting"]);
    expect(await readJsonFile(join(dir, "locales", "fr.json"))).toEqual({ greeting: "Bonjour" });
  });

  it.each([
    ["no manifest at all", undefined],
    ["a manifest that is not JSON", "{ not json"],
    ["a manifest of an unsupported version", '{"version":2,"format":"csv","locales":["de"]}'],
    ["a manifest written for another format", '{"version":1,"format":"tsv","locales":["de"]}'],
    ["a manifest with an unexpected shape", '{"version":1,"format":"csv","locales":"de"}'],
  ])("reads every present file when the directory has %s", async (_case, manifest) => {
    const dir = await project({ greeting: "Hello" });
    await exportedWideHandoff(dir);
    if (manifest === undefined) {
      await rm(manifestPath(dir));
    } else {
      await writeFile(manifestPath(dir), manifest, "utf8");
    }

    const summary = await importHandoff(dir);

    expect(summary.failed).toEqual([]);
    expect(await readJsonFile(join(dir, "locales", "fr.json"))).toEqual({ greeting: "Bonjour" });
  });
});

describe("importWorkbook: a delimited handoff is judged exactly like a workbook", () => {
  it("produces the same locale summary for the same rows as xlsx and as csv", async () => {
    const source = { greeting: "Hello {{name}}", farewell: "Bye {{name}}", pending: "Pending" };
    const config = cfg({ targetLocales: ["de"] });
    const fills = { greeting: "Hallo {{name}}", farewell: "Tschuess" };

    const xlsxDir = await project(source);
    const xlsxResult = await exportWorkbook({ config, cwd: xlsxDir });
    const exported = await readWorkbook(new Uint8Array(await readFile(xlsxResult.path)));
    const sheet = exported.sheets[0];
    if (sheet === undefined) {
      throw new Error("expected one sheet");
    }
    const rows = sheet.rows.map((row) =>
      fills[row.key as keyof typeof fills] !== undefined
        ? { ...row, translation: fills[row.key as keyof typeof fills] as string }
        : row,
    );
    await writeFile(xlsxResult.path, await buildWorkbook({ sheets: [{ locale: "de", rows }] }));

    const csvDir = await project(source);
    await exportWorkbook({ config, cwd: csvDir, format: "csv", out: "handoff" });
    await fillExported(join(csvDir, "handoff", "de.csv"), "de", "csv", fills);

    const fromXlsx = await importWorkbook({ config, cwd: xlsxDir, workbook: xlsxResult.path });
    const fromCsv = await importWorkbook({
      config,
      cwd: csvDir,
      workbook: "handoff",
      format: "csv",
    });

    expect(fromCsv.locales).toEqual(fromXlsx.locales);
    expect(fromCsv.locales[0]?.translated).toEqual(["greeting"]);
    expect(fromCsv.locales[0]?.integrityMismatches).toEqual(["farewell"]);
    expect(fromCsv.locales[0]?.unfilled).toEqual(["pending"]);
    expect(await readJsonFile(join(csvDir, "locales", "de.json"))).toEqual(
      await readJsonFile(join(xlsxDir, "locales", "de.json")),
    );
  });

  it("withholds a row whose visible source hash was edited or blanked by a translator", async () => {
    const dir = await project({ greeting: "Hello", farewell: "Bye" });
    const config = cfg({ targetLocales: ["de"] });
    await exportWorkbook({ config, cwd: dir, format: "csv", out: "handoff" });

    const path = join(dir, "handoff", "de.csv");
    const data = await readExported(path, "de", "csv");
    const rows = (data.sheets[0]?.rows ?? []).map((row) => ({
      ...row,
      translation: row.key === "greeting" ? "Hallo" : "Tschuess",
      sourceHash: row.key === "greeting" ? "tampered" : "",
    }));
    await writeFile(path, buildDelimited({ locale: "de", rows }, "csv"), "utf8");

    const summary = await importWorkbook({
      config,
      cwd: dir,
      workbook: "handoff",
      format: "csv",
    });
    expect(summary.locales[0]?.translated).toEqual([]);
    expect(summary.locales[0]?.integrityMismatches).toEqual(["farewell", "greeting"]);
    await expect(readFile(join(dir, "locales", "de.json"), "utf8")).rejects.toThrow();
  });

  it("reports a malformed row per row and imports the rest of the file", async () => {
    const dir = await project({ greeting: "Hello", farewell: "Bye" });
    const config = cfg({ targetLocales: ["de"] });
    await exportWorkbook({ config, cwd: dir, format: "csv", out: "handoff" });

    const path = join(dir, "handoff", "de.csv");
    const data = await readExported(path, "de", "csv");
    const rows = (data.sheets[0]?.rows ?? []).map((row) => ({ ...row, translation: "Uebersetzt" }));
    const text = buildDelimited({ locale: "de", rows }, "csv");
    await writeFile(path, `${text}broken,row\n`, "utf8");

    const summary = await importWorkbook({ config, cwd: dir, workbook: "handoff", format: "csv" });
    expect(summary.locales[0]?.translated).toEqual(["farewell", "greeting"]);
    expect(summary.locales[0]?.malformedRows).toEqual([
      { row: 4, line: 4, column: "Current translation" },
    ]);
  });

  it("carries the file line of a malformed row past a source with an embedded line break", async () => {
    const dir = await project({ greeting: "Hello\nagain", farewell: "Bye" });
    const config = cfg({ targetLocales: ["de"] });
    await exportWorkbook({ config, cwd: dir, format: "csv", out: "handoff" });

    const path = join(dir, "handoff", "de.csv");
    const data = await readExported(path, "de", "csv");
    const rows = (data.sheets[0]?.rows ?? []).map((row) => ({ ...row, translation: "Uebersetzt" }));
    const text = buildDelimited({ locale: "de", rows }, "csv");
    await writeFile(path, `${text}broken,row\n`, "utf8");

    const summary = await importWorkbook({ config, cwd: dir, workbook: "handoff", format: "csv" });
    expect(summary.locales[0]?.malformedRows).toEqual([
      { row: 4, line: 5, column: "Current translation" },
    ]);
  });

  it("keeps the first occurrence of a duplicated key and reports the later one", async () => {
    const dir = await project({ greeting: "Hello" });
    const config = cfg({ targetLocales: ["de"] });
    await exportWorkbook({ config, cwd: dir, format: "csv", out: "handoff" });

    const path = join(dir, "handoff", "de.csv");
    const data = await readExported(path, "de", "csv");
    const first = data.sheets[0]?.rows[0];
    if (first === undefined) {
      throw new Error("expected one row");
    }
    const rows = [
      { ...first, translation: "Hallo" },
      { ...first, translation: "Servus" },
    ];
    await writeFile(path, buildDelimited({ locale: "de", rows }, "csv"), "utf8");

    const summary = await importWorkbook({ config, cwd: dir, workbook: "handoff", format: "csv" });
    expect(summary.locales[0]?.duplicateKeys).toEqual([{ key: "greeting", row: 3, line: 3 }]);
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ greeting: "Hallo" });
  });
});
