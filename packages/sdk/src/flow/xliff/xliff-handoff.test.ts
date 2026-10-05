import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { readXliff, type XliffVersion } from "@verbatra/exchange";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../../config/schema.js";
import { SdkError } from "../../errors.js";
import { PROVENANCE_FILE_NAME } from "../../lock/provenance-file.js";
import {
  baseConfig,
  editXliffUnit,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
  xliffSourceInner,
} from "../../test-support.js";
import { check } from "../check.js";
import { approveEntry } from "../review-decision.js";
import { translate } from "../translate-project.js";
import type { XliffFormat } from "../workbook/exchange-format.js";
import { exportWorkbook } from "../workbook/export-workbook.js";
import { importWorkbook } from "../workbook/import-workbook.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de", "fr"], ...overrides });

const FORMATS: ReadonlyArray<readonly [XliffFormat, XliffVersion]> = [
  ["xliff2", "2.0"],
  ["xliff12", "1.2"],
];

const REVIEWED: Readonly<Record<XliffFormat, string>> = {
  xliff2: "reviewed",
  xliff12: "signed-off",
};

const TRANSLATED = "translated";

async function project(source: Record<string, string>): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  return dir;
}

async function translatedProject(source: Record<string, string>): Promise<string> {
  const dir = await project(source);
  await translate(
    { config: cfg(), cwd: dir },
    { createProvider: (provider) => makeStubProvider({ id: provider.id }).provider },
  );
  return dir;
}

async function localeJson(dir: string, locale: string): Promise<Record<string, string>> {
  return (await readJsonFile(join(dir, "locales", `${locale}.json`))) as Record<string, string>;
}

async function localeBytes(dir: string, locale: string): Promise<string> {
  return readFile(join(dir, "locales", `${locale}.json`), "utf8");
}

interface ProvenanceJson {
  readonly locales: Record<string, Record<string, Record<string, string>>>;
}

async function provenanceOf(dir: string, locale: string, key: string) {
  const file = (await readJsonFile(join(dir, PROVENANCE_FILE_NAME))) as ProvenanceJson;
  return file.locales[locale]?.[key];
}

async function exported(dir: string, locale = "de"): Promise<string> {
  return readFile(join(dir, "handoff", `${locale}.xlf`), "utf8");
}

async function edit(dir: string, locale: string, change: (xml: string) => string): Promise<void> {
  const path = join(dir, "handoff", `${locale}.xlf`);
  await writeFile(path, change(await readFile(path, "utf8")), "utf8");
}

describe.each(FORMATS)("XLIFF handoff (%s)", (format, version) => {
  const exportTo = (dir: string, extra: { includeUnchanged?: boolean; locales?: string[] } = {}) =>
    exportWorkbook({ config: cfg(), cwd: dir, format, out: "handoff", ...extra });
  const importFrom = (dir: string, extra: { dryRun?: boolean; reviewer?: string } = {}) =>
    importWorkbook({ config: cfg(), cwd: dir, workbook: "handoff", format, ...extra });

  it("writes one file per locale plus the shared XLIFF manifest", async () => {
    const dir = await project({ greeting: "Hello {{name}}!", farewell: "Bye" });

    const result = await exportTo(dir);

    expect(result.locales).toEqual([
      { locale: "de", rows: 2 },
      { locale: "fr", rows: 2 },
    ]);
    const manifest = await readJsonFile(join(dir, "handoff", ".verbatra-export-xliff.json"));
    expect(manifest).toEqual({ version: 1, format: "xliff", locales: ["de", "fr"] });
    const document = readXliff(await exported(dir));
    expect(document.version).toBe(version);
    expect(document.targetLanguage).toBe("de");
    expect(document.units.map((unit) => [unit.key, unit.source, unit.target, unit.state])).toEqual([
      ["farewell", "Bye", undefined, "initial"],
      ["greeting", "Hello {{name}}!", undefined, "initial"],
    ]);
  });

  it("imports what a CAT tool filled, keeps placeholders, and leaves untouched keys alone", async () => {
    const dir = await project({ greeting: "Hello {{name}}!", farewell: "Bye", title: "Title" });
    await exportTo(dir);
    await edit(dir, "de", (xml) => {
      const greeting = xliffSourceInner(xml, "greeting").replace("Hello", "Hallo");
      const filled = editXliffUnit(xml, "greeting", { target: greeting, state: TRANSLATED });
      return editXliffUnit(filled, "farewell", { target: "Tschüss", state: REVIEWED[format] });
    });

    const summary = await importFrom(dir, { reviewer: "Ana" });

    const de = summary.locales.find((locale) => locale.locale === "de");
    expect(de?.translated).toEqual(["farewell", "greeting"]);
    expect(de?.unfilled).toEqual(["title"]);
    expect(de?.notices.map((notice) => notice.code)).toContain("HANDOFF_REVIEWS_RECORDED");
    expect(await localeJson(dir, "de")).toEqual({
      greeting: "Hallo {{name}}!",
      farewell: "Tschüss",
    });
    expect(await provenanceOf(dir, "de", "farewell")).toMatchObject({
      origin: "import",
      reviewState: "approved",
      reviewer: "Ana",
    });
    expect(await provenanceOf(dir, "de", "greeting")).not.toHaveProperty("reviewState");
    const fr = summary.locales.find((locale) => locale.locale === "fr");
    expect(fr?.translated).toEqual([]);
    expect(fr?.unfilled).toEqual(["farewell", "greeting", "title"]);
  });

  it("leaves an up-to-date file byte-identical and records a review the tool made", async () => {
    const dir = await translatedProject({ greeting: "Hello {{name}}!", farewell: "Bye" });
    const before = await localeBytes(dir, "de");
    await exportTo(dir, { includeUnchanged: true });
    expect(readXliff(await exported(dir)).units.map((unit) => unit.state)).toEqual([
      "translated",
      "translated",
    ]);
    await edit(dir, "de", (xml) => editXliffUnit(xml, "greeting", { state: REVIEWED[format] }));

    const summary = await importFrom(dir);

    expect(await localeBytes(dir, "de")).toBe(before);
    const de = summary.locales.find((locale) => locale.locale === "de");
    expect(de?.translated).toEqual([]);
    expect(de?.unchanged).toEqual(["farewell", "greeting"]);
    expect(await provenanceOf(dir, "de", "greeting")).toMatchObject({
      origin: "machine",
      reviewState: "approved",
    });
    expect(await provenanceOf(dir, "de", "farewell")).not.toHaveProperty("reviewState");

    await exportTo(dir, { includeUnchanged: true });
    const states = readXliff(await exported(dir)).units.map((unit) => [unit.key, unit.state]);
    expect(states).toEqual([
      ["farewell", "translated"],
      ["greeting", "reviewed"],
    ]);
  });

  it("prefills a stale key with its old translation and keeps it stale until the tool confirms it", async () => {
    const dir = await translatedProject({ greeting: "Hello", farewell: "Bye" });
    await writeJsonFile(join(dir, "locales", "en.json"), {
      greeting: "Hello there",
      farewell: "Goodbye",
    });
    await exportTo(dir, { locales: ["de"] });
    const units = readXliff(await exported(dir)).units;
    expect(units.map((unit) => [unit.key, unit.target, unit.state])).toEqual([
      ["farewell", "[de] Bye", "initial"],
      ["greeting", "[de] Hello", "initial"],
    ]);
    await edit(dir, "de", (xml) =>
      editXliffUnit(xml, "farewell", { target: "[de] Bye", state: TRANSLATED }),
    );

    const summary = await importFrom(dir);

    const de = summary.locales.find((locale) => locale.locale === "de");
    expect(de?.translated).toEqual(["farewell"]);
    expect(de?.unfilled).toEqual(["greeting"]);
    const status = await check({ config: cfg({ targetLocales: ["de"] }), cwd: dir });
    expect(status.locales[0]).toMatchObject({ stale: 1, upToDate: 1 });
  });

  it("withholds a unit whose source changed after the export", async () => {
    const dir = await project({ greeting: "Hello" });
    await exportTo(dir);
    await edit(dir, "de", (xml) =>
      editXliffUnit(xml, "greeting", { target: "Hallo", state: TRANSLATED }),
    );
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello again" });

    const summary = await importFrom(dir);

    const de = summary.locales.find((locale) => locale.locale === "de");
    expect(de?.integrityMismatches).toEqual(["greeting"]);
    expect(await localeJson(dir, "de").catch(() => ({}))).toEqual({});
  });

  it("falls back to the source text when a tool stripped the source hash", async () => {
    const dir = await project({ greeting: "Hello", farewell: "Bye" });
    await exportTo(dir);
    await edit(dir, "de", (xml) =>
      editXliffUnit(
        editXliffUnit(xml, "greeting", { target: "Hallo", dropHash: true }),
        "farewell",
        { target: "Tschüss", dropHash: true },
      ),
    );
    await writeJsonFile(join(dir, "locales", "en.json"), {
      greeting: "Hello",
      farewell: "Goodbye",
    });

    const summary = await importFrom(dir);

    const de = summary.locales.find((locale) => locale.locale === "de");
    expect(de?.translated).toEqual(["greeting"]);
    expect(de?.integrityMismatches).toEqual(["farewell"]);
  });

  it("refuses a translation that drops a placeholder and clears a key on [[CLEAR]]", async () => {
    const dir = await translatedProject({ greeting: "Hello {{name}}!", farewell: "Bye" });
    await writeJsonFile(join(dir, "locales", "en.json"), {
      greeting: "Hi {{name}}!",
      farewell: "Bye!",
    });
    await exportTo(dir, { locales: ["de"] });
    await edit(dir, "de", (xml) =>
      editXliffUnit(
        editXliffUnit(xml, "greeting", { target: "Hallo!", state: TRANSLATED }),
        "farewell",
        { target: "[[CLEAR]]", state: TRANSLATED },
      ),
    );

    const summary = await importFrom(dir);

    const de = summary.locales.find((locale) => locale.locale === "de");
    expect(de?.integrityRefusals?.map((refusal) => refusal.key)).toEqual(["greeting"]);
    expect(de?.translated).toEqual(["farewell"]);
    expect((await localeJson(dir, "de")).farewell).toBe("");
  });

  it("reports an unknown or duplicated unit instead of failing the locale", async () => {
    const dir = await project({ greeting: "Hello" });
    await exportTo(dir, { locales: ["de"] });
    await edit(dir, "de", (xml) => {
      const filled = editXliffUnit(xml, "greeting", { target: "Hallo", state: TRANSLATED });
      const unit = /\s*<(trans-)?unit [\s\S]*?<\/(trans-)?unit>/.exec(filled)?.[0] ?? "";
      const invented = unit.replaceAll("greeting", "invented");
      const duplicate = unit.replace("Hallo", "Servus");
      return filled.replace(unit, `${unit}${duplicate}${invented}`);
    });

    const summary = await importFrom(dir);

    const de = summary.locales.find((locale) => locale.locale === "de");
    expect(de?.status).not.toBe("failed");
    expect(de?.translated).toEqual(["greeting"]);
    expect(de?.duplicateKeys.map((duplicate) => duplicate.key)).toEqual(["greeting"]);
    expect(de?.malformedRows).toEqual([expect.objectContaining({ row: 3, column: "id" })]);
    expect((await localeJson(dir, "de")).greeting).toBe("Hallo");
  });

  it("reports a broken unit and an unknown key as malformed rows in file order", async () => {
    const dir = await project({ alpha: "Alpha", beta: "Beta", gamma: "Gamma" });
    await exportTo(dir, { locales: ["de"] });
    let edited = "";
    await edit(dir, "de", (xml) => {
      const units = [...xml.matchAll(/\s*<(trans-)?unit [\s\S]*?<\/(trans-)?unit>/g)].map(
        (match) => match[0],
      );
      const alpha = units[0] ?? "";
      const beta = units[1] ?? "";
      const invented = alpha.replaceAll("alpha", "invented");
      const broken = beta.replace(/<source>[\s\S]*?<\/source>/, "");
      edited = xml.replace(alpha, `${invented}${alpha}`).replace(beta, broken);
      return edited;
    });
    const lineOfUnit = (key: string): number => {
      const at = edited.search(new RegExp(`<(trans-)?unit [^>]*"${key}"`));
      return edited.slice(0, at).split("\n").length;
    };

    const summary = await importFrom(dir);

    const de = summary.locales.find((locale) => locale.locale === "de");
    expect(de?.malformedRows).toEqual([
      { row: 1, line: lineOfUnit("invented"), column: "id" },
      { row: 3, line: lineOfUnit("beta"), column: "source" },
    ]);
    expect(de?.translated).toEqual([]);
  });

  it("reports approvals on a dry run without writing anything", async () => {
    const dir = await project({ greeting: "Hello" });
    await exportTo(dir, { locales: ["de"] });
    await edit(dir, "de", (xml) =>
      editXliffUnit(xml, "greeting", { target: "Hallo", state: "final" }),
    );

    const summary = await importFrom(dir, { dryRun: true });

    const de = summary.locales.find((locale) => locale.locale === "de");
    expect(de?.translated).toEqual(["greeting"]);
    expect(de?.notices).toContainEqual({
      code: "HANDOFF_REVIEWS_RECORDED",
      message: "1 key the handoff marks reviewed or final would be recorded as approved.",
    });
    await expect(readFile(join(dir, "locales", "de.json"), "utf8")).rejects.toThrow();
  });

  it("refuses a leftover file the latest export did not include", async () => {
    const dir = await project({ greeting: "Hello" });
    await exportTo(dir);
    await exportTo(dir, { locales: ["de"] });

    const summary = await importFrom(dir);

    const fr = summary.locales.find((locale) => locale.locale === "fr");
    expect(fr?.error?.code).toBe("HANDOFF_FILE_STALE");
    expect(fr?.error?.message).toContain('"fr.xlf"');
  });

  it("marks where each exported target came from, and imports it back unharmed", async () => {
    const dir = await translatedProject({ greeting: "Hello {{name}}!", farewell: "Bye" });
    await approveEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "farewell",
      expectedValue: (await localeJson(dir, "de")).farewell ?? "",
    });

    const result = await exportTo(dir, { includeUnchanged: true });
    const xml = await exported(dir);

    expect(result.provenanceMarkers).toBe("written");
    if (version === "1.2") {
      expect(xml.match(/state-qualifier="mt-suggestion"/g)).toHaveLength(1);
      expect(xml).toMatch(/id="greeting"[^>]*>[\s\S]*?state-qualifier="mt-suggestion"/);
    } else {
      expect(xml).toContain('<mda:meta type="origin">machine</mda:meta>');
      expect(xml).toContain('<mda:meta type="review-state">approved</mda:meta>');
      expect(xml).toContain('<mda:meta type="review-state">unreviewed</mda:meta>');
    }
    const before = await localeBytes(dir, "de");
    const summary = await importFrom(dir);
    expect(summary.locales.find((locale) => locale.locale === "de")?.translated).toEqual([]);
    expect(await localeBytes(dir, "de")).toBe(before);
  });

  it("writes no marker when the provenance file cannot be read", async () => {
    const dir = await translatedProject({ greeting: "Hello {{name}}!" });
    await writeFile(join(dir, PROVENANCE_FILE_NAME), "{ not json", "utf8");

    const result = await exportTo(dir, { includeUnchanged: true });
    const xml = await exported(dir);

    expect(result.provenanceMarkers).toBe("unavailable");
    expect(xml).not.toContain("state-qualifier");
    expect(xml).not.toContain('type="origin"');
  });
});

describe("XLIFF handoff: single files and refusals", () => {
  it("detects XLIFF by extension and resolves a renamed file by its target language", async () => {
    const dir = await project({ greeting: "Hello" });
    await exportWorkbook({ config: cfg(), cwd: dir, format: "xliff2", out: "handoff" });
    const path = join(dir, "handoff", "de.xlf");
    await writeFile(
      path,
      editXliffUnit(await readFile(path, "utf8"), "greeting", {
        target: "Hallo",
        state: "translated",
      }),
    );
    await rename(path, join(dir, "handoff", "project_translated.xlf"));

    const summary = await importWorkbook({
      config: cfg(),
      cwd: dir,
      workbook: join("handoff", "project_translated.xlf"),
    });

    expect(summary.locales.map((locale) => [locale.locale, locale.translated])).toEqual([
      ["de", ["greeting"]],
    ]);
  });

  it("fails the file's locale when neither its name nor its language is configured", async () => {
    const dir = await project({ greeting: "Hello" });
    await exportWorkbook({ config: cfg(), cwd: dir, format: "xliff12", out: "handoff" });
    const text = (await readFile(join(dir, "handoff", "de.xlf"), "utf8")).replace(
      'target-language="de"',
      'target-language="it"',
    );
    await writeFile(join(dir, "handoff", "other.xliff"), text);

    const summary = await importWorkbook({
      config: cfg(),
      cwd: dir,
      workbook: join("handoff", "other.xliff"),
    });

    expect(summary.locales[0]?.locale).toBe("other");
    expect(summary.locales[0]?.error?.code).toBe("CONFIG_INVALID");
    expect(summary.locales[0]?.error?.message).toContain('"other.xlf"');
  });

  it("reports a configured locale with no file in the directory", async () => {
    const dir = await project({ greeting: "Hello" });
    await exportWorkbook({ config: cfg(), cwd: dir, format: "xliff2", out: "handoff" });
    await writeFile(join(dir, "handoff", ".verbatra-export-xliff.json"), "not json");
    await rename(join(dir, "handoff", "fr.xlf"), join(dir, "handoff", "fr.bak"));

    const summary = await importWorkbook({
      config: cfg(),
      cwd: dir,
      workbook: "handoff",
      format: "xliff12",
    });

    const fr = summary.locales.find((locale) => locale.locale === "fr");
    expect(fr?.error?.code).toBe("WORKBOOK_SHEET_MISSING");
    expect(fr?.error?.message).toContain('"fr.xlf"');
  });

  it("names the XLIFF files it looked for in an empty directory", async () => {
    const dir = await project({ greeting: "Hello" });
    await mkdir(join(dir, "empty"));

    await expect(
      importWorkbook({ config: cfg(), cwd: dir, workbook: "empty", format: "xliff2" }),
    ).rejects.toMatchObject({
      code: "SOURCE_UNREADABLE",
      message: expect.stringContaining("No XLIFF file was found") as unknown,
    });
  });

  it("refuses a file that is not XLIFF as SOURCE_INVALID", async () => {
    const dir = await project({ greeting: "Hello" });
    await writeFile(join(dir, "de.xlf"), "<tmx/>");

    await expect(
      importWorkbook({ config: cfg(), cwd: dir, workbook: "de.xlf" }),
    ).rejects.toMatchObject({ code: "SOURCE_INVALID" });
  });

  it("refuses an invalid reviewer before reading anything", async () => {
    await expect(
      importWorkbook({ config: cfg(), cwd: "/nonexistent", workbook: "x.xlf", reviewer: "" }),
    ).rejects.toBeInstanceOf(SdkError);
  });
});
