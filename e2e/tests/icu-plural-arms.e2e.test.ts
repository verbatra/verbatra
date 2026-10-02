import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  fillWorkbook,
  type RunResult,
  readJsonIn,
  readSharedConsumer,
  runVerbatra,
  writeJsonIn,
} from "../src/harness.js";

let consumer: Consumer;

const SOURCE = {
  files: "{n, plural, one {# file} other {# files}}",
  saved: "{n, plural, =0 {Nothing saved} one {# file saved} other {# files saved}}",
};

async function importInto(
  locale: string,
  values: Readonly<Record<string, string>>,
): Promise<{ readonly run: RunResult; readonly target: Record<string, string> }> {
  const dir = join(consumer.dir, `icu-plural-arms-${locale}`);
  await mkdir(dir, { recursive: true });
  await writeJsonIn(dir, ".verbatrarc.json", {
    sourceLocale: "en",
    targetLocales: [locale],
    format: "next-intl-json",
    files: { pattern: "messages/{locale}.json" },
    provider: { id: "gemini", options: { model: "gemini-2.5-flash", maxOutputTokens: 4096 } },
  });
  await writeJsonIn(dir, "messages/en.json", SOURCE);
  await writeJsonIn(dir, `messages/${locale}.json`, {});

  const workbookPath = join(dir, "verbatra-translations.xlsx");
  expect(
    (await runVerbatra(consumer, ["export", "--out", workbookPath, "--cwd", dir])).exitCode,
  ).toBe(0);
  await fillWorkbook(workbookPath, (key) => values[key]);

  const run = await runVerbatra(consumer, ["import", workbookPath, "--cwd", dir]);
  const target = await readJsonIn<Record<string, string>>(dir, `messages/${locale}.json`);
  return { run, target };
}

beforeAll(async () => {
  consumer = await readSharedConsumer();
}, 180_000);

describe("ICU plural arms follow each target language's CLDR categories", () => {
  it("writes a Russian plural with one, few, many and other, and withholds one keeping the English arms", async () => {
    const russian = "{n, plural, one {# файл} few {# файла} many {# файлов} other {# файла}}";
    const { run, target } = await importInto("ru", {
      files: russian,
      saved: "{n, plural, =0 {Ничего не сохранено} one {# файл} other {# файлов}}",
    });

    expect(run.exitCode).toBe(1);
    expect(run.stdout).toContain("1 translated, 0 unchanged, 1 integrity-withheld");
    expect(target).toEqual({ files: russian });
  });

  it("writes Japanese plurals with other alone, keeping the source's exact-value arm", async () => {
    const japanese = {
      files: "{n, plural, other {# 個のファイル}}",
      saved: "{n, plural, =0 {保存なし} other {# 個を保存}}",
    };
    const { run, target } = await importInto("ja", japanese);

    expect(run.exitCode).toBe(0);
    expect(target).toEqual(japanese);
  });
});
