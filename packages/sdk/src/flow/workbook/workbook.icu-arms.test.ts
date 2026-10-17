import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { contentHash, type TranslationEntry } from "@verbatra/core";
import { buildWorkbook, readWorkbook } from "@verbatra/exchange";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../../config/schema.js";
import { baseConfig, makeTempDir, writeJsonFile } from "../../test-support.js";
import { exportWorkbook } from "./export-workbook.js";
import { importWorkbook } from "./import-workbook.js";

const cfg: VerbatraConfig = baseConfig({ targetLocales: ["ru"], format: "next-intl-json" });

const SOURCE = "{count, plural, one {# file} other {# files}}";
const ENGLISH_ARMS = "{count, plural, one {# файл} other {# файлов}}";
const RUSSIAN_ARMS = "{count, plural, one {# файл} few {# файла} many {# файлов} other {# файла}}";
const MISSING_ARMS = [
  '{count} plural: missing arm "few" required by the target language',
  '{count} plural: missing arm "many" required by the target language',
];

function entry(value: string): TranslationEntry {
  return { key: "k", namespace: "en", value, placeholders: [], isPlural: false };
}

async function project(
  source: Record<string, string>,
  target: Record<string, string>,
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  await writeJsonFile(join(dir, "locales", "ru.json"), target);
  return dir;
}

async function rows(path: string) {
  return (await readWorkbook(new Uint8Array(await readFile(path)))).sheets[0]?.rows ?? [];
}

describe("exportWorkbook: ICU arms in the review columns", () => {
  it("flags a current translation whose plural arms do not fit the target language", async () => {
    const dir = await project({ files: SOURCE }, { files: ENGLISH_ARMS });

    const result = await exportWorkbook({ config: cfg, cwd: dir, includeUnchanged: true });

    const row = (await rows(result.path)).find((candidate) => candidate.key === "files");
    expect(row?.reviewStatus).toBe("review");
    expect(row?.reviewReasons).toBe(`icu-arms: ${MISSING_ARMS.join("; ")}`);
  });

  it("leaves a translation carrying the target language's categories unflagged", async () => {
    const dir = await project({ files: SOURCE }, { files: RUSSIAN_ARMS });

    const result = await exportWorkbook({ config: cfg, cwd: dir, includeUnchanged: true });

    const row = (await rows(result.path)).find((candidate) => candidate.key === "files");
    expect(row?.reviewStatus).toBe("ok");
    expect(row?.reviewReasons).toBe("");
  });
});

describe("importWorkbook: integrity refusals name what is wrong", () => {
  it("names the wrong arms of a refused row and lists a drifted row as a mismatch only", async () => {
    const dir = await project({ files: SOURCE, title: "Title" }, {});
    const out = await exportWorkbook({ config: cfg, cwd: dir });
    const data = await readWorkbook(new Uint8Array(await readFile(out.path)));
    const sheets = data.sheets.map((sheet) => ({
      locale: sheet.locale,
      rows: sheet.rows.map((row) =>
        row.key === "files"
          ? { ...row, translation: ENGLISH_ARMS }
          : { ...row, translation: "Titel", sourceHash: contentHash(entry("Old title")) },
      ),
    }));
    await writeFile(out.path, await buildWorkbook({ sheets }));

    const summary = await importWorkbook({ config: cfg, workbook: out.path, cwd: dir });

    const locale = summary.locales[0];
    expect(locale?.integrityMismatches).toEqual(["files", "title"]);
    expect(locale?.integrityRefusals).toEqual([
      { key: "files", reason: "icu", details: MISSING_ARMS },
    ]);
  });

  it("reports an empty refusal list when every row is accepted", async () => {
    const dir = await project({ files: SOURCE }, {});
    const out = await exportWorkbook({ config: cfg, cwd: dir });
    const data = await readWorkbook(new Uint8Array(await readFile(out.path)));
    const sheets = data.sheets.map((sheet) => ({
      locale: sheet.locale,
      rows: sheet.rows.map((row) => ({ ...row, translation: RUSSIAN_ARMS })),
    }));
    await writeFile(out.path, await buildWorkbook({ sheets }));

    const summary = await importWorkbook({ config: cfg, workbook: out.path, cwd: dir });

    expect(summary.locales[0]?.integrityRefusals).toEqual([]);
    expect(summary.locales[0]?.translated).toEqual(["files"]);
  });

  it("lists the refusals by key whatever order the rows come back in", async () => {
    const dir = await project({ a: SOURCE, b: SOURCE, c: SOURCE }, {});
    const out = await exportWorkbook({ config: cfg, cwd: dir });
    const data = await readWorkbook(new Uint8Array(await readFile(out.path)));
    const sheets = data.sheets.map((sheet) => ({
      locale: sheet.locale,
      rows: [...sheet.rows].reverse().map((row) => ({ ...row, translation: ENGLISH_ARMS })),
    }));
    await writeFile(out.path, await buildWorkbook({ sheets }));

    const summary = await importWorkbook({ config: cfg, workbook: out.path, cwd: dir });

    expect(summary.locales[0]?.integrityRefusals?.map((refusal) => refusal.key)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});
