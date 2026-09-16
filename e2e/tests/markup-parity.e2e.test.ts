import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  readJsonIn,
  readSharedConsumer,
  runVerbatra,
  writeJsonIn,
} from "../src/harness.js";

const HEADER_ROW = 1;
const KEY_COLUMN = 1;
const TRANSLATION_COLUMN = 5;
const INSTRUCTIONS_SHEET = "Instructions";

let consumer: Consumer;

const config = {
  sourceLocale: "en",
  targetLocales: ["de"],
  format: "i18next-json",
  files: { pattern: "locales/{locale}.json" },
  provider: { id: "gemini", options: { model: "gemini-2.5-flash", maxOutputTokens: 4096 } },
};

async function fillTranslations(
  workbookPath: string,
  values: Readonly<Record<string, string>>,
): Promise<void> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(workbookPath);
  for (const sheet of workbook.worksheets) {
    if (sheet.name === INSTRUCTIONS_SHEET) {
      continue;
    }
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === HEADER_ROW) {
        return;
      }
      const key = String(row.getCell(KEY_COLUMN).value);
      const translation = values[key];
      if (translation !== undefined) {
        row.getCell(TRANSLATION_COLUMN).value = translation;
      }
    });
  }
  await workbook.xlsx.writeFile(workbookPath);
}

beforeAll(async () => {
  consumer = await readSharedConsumer();
}, 180_000);

describe("inline markup parity on the import path", () => {
  it("writes a translation that keeps the source's tags and withholds one that drops them", async () => {
    const dir = join(consumer.dir, "markup-parity");
    await mkdir(dir, { recursive: true });
    await writeJsonIn(dir, ".verbatrarc.json", config);
    await writeJsonIn(dir, "locales/en.json", {
      docsLink: 'Read <a href="/docs">the docs</a>',
      broken: "Tap <b>Save</b> to continue",
      prose: "Wait < 5 minutes",
    });
    await writeJsonIn(dir, "locales/de.json", {});

    const workbookPath = join(dir, "verbatra-translations.xlsx");
    expect(
      (await runVerbatra(consumer, ["export", "--out", workbookPath, "--cwd", dir])).exitCode,
    ).toBe(0);

    await fillTranslations(workbookPath, {
      docsLink: 'Lies <a href="/de/doku">die Doku</a>',
      broken: "Tippe auf Speichern",
      prose: "Warte < 5 Minuten",
    });

    const imported = await runVerbatra(consumer, ["import", workbookPath, "--cwd", dir]);
    expect(imported.exitCode).toBe(1);
    expect(imported.stdout).toContain("2 translated, 0 unchanged, 1 integrity-withheld");

    const de = await readJsonIn<Record<string, string>>(dir, "locales/de.json");
    expect(de.docsLink).toBe('Lies <a href="/de/doku">die Doku</a>');
    expect(de.prose).toBe("Warte < 5 Minuten");
    expect(de.broken).toBeUndefined();
  });
});
