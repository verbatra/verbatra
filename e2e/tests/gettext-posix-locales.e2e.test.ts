import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  JSON_ENVELOPE_VERSION,
  parseEnvelope,
  readSharedConsumer,
  runVerbatra,
  writeFileIn,
  writeJsonIn,
} from "../src/harness.js";

interface CheckSummaryJson {
  inSync: boolean;
  locales: { locale: string; missing: number }[];
}

const PATTERN = "locale/{locale}/LC_MESSAGES/messages.po";

const HEADER = 'msgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=UTF-8\\n"\n\n';

const SOURCE = `${HEADER}msgid "greeting"\nmsgstr "Hello %s"\n\nmsgid "farewell"\nmsgstr "Goodbye"\n`;

const SERBIAN_LATIN = `${HEADER}msgid "greeting"\nmsgstr "Zdravo %s"\n\nmsgid "farewell"\nmsgstr "Doviđenja"\n`;

const LATIN_AMERICAN_SPANISH = `${HEADER}msgid "greeting"\nmsgstr "Hola %s"\n\nmsgid "farewell"\nmsgstr "Adiós"\n`;

const TRADITIONAL_CHINESE = `${HEADER}msgid "greeting"\nmsgstr "你好 %s"\n\nmsgid "farewell"\nmsgstr "再見"\n`;

let consumer: Consumer;

async function seedProject(name: string, targetLocales: readonly string[]): Promise<string> {
  const dir = join(consumer.dir, name);
  await mkdir(dir, { recursive: true });
  await writeJsonIn(dir, ".verbatrarc.json", {
    sourceLocale: "en",
    targetLocales,
    format: "gettext-po",
    files: { pattern: PATTERN, localeStyle: "posix" },
    provider: { id: "none" },
  });
  await writeFileIn(dir, "locale/en/LC_MESSAGES/messages.po", SOURCE);
  await writeFileIn(dir, "locale/sr@latin/LC_MESSAGES/messages.po", SERBIAN_LATIN);
  await writeFileIn(dir, "locale/es_419/LC_MESSAGES/messages.po", LATIN_AMERICAN_SPANISH);
  await writeFileIn(dir, "locale/zh_TW/LC_MESSAGES/messages.po", TRADITIONAL_CHINESE);
  return dir;
}

function checkSummary(stdout: string): CheckSummaryJson {
  const envelope = parseEnvelope<CheckSummaryJson>(stdout);
  if (!envelope.ok) {
    throw new Error(
      `Expected a check success envelope, got [${envelope.code}] ${envelope.message}`,
    );
  }
  expect(envelope.version).toBe(JSON_ENVELOPE_VERSION);
  return envelope.result;
}

beforeAll(async () => {
  consumer = await readSharedConsumer();
}, 180_000);

describe("gettext locale names under the posix style (no provider)", () => {
  it("reads sr@latin, es_419 and zh_TW as sr-Latn, es-419 and zh-Hant-TW, and check passes", async () => {
    const dir = await seedProject("gettext-posix-in-sync", ["sr-Latn", "es-419", "zh-Hant-TW"]);

    const result = await runVerbatra(consumer, ["check", "--json", "--cwd", dir]);

    expect(result.exitCode).toBe(0);
    const summary = checkSummary(result.stdout);
    expect(summary.inSync).toBe(true);
    expect(summary.locales.map(({ locale, missing }) => ({ locale, missing }))).toEqual([
      { locale: "sr-Latn", missing: 0 },
      { locale: "es-419", missing: 0 },
      { locale: "zh-Hant-TW", missing: 0 },
    ]);
  });

  it("counts a key missing from the sr@latin catalogue against sr-Latn", async () => {
    const dir = await seedProject("gettext-posix-behind", ["sr-Latn"]);
    await writeFileIn(
      dir,
      "locale/sr@latin/LC_MESSAGES/messages.po",
      `${HEADER}msgid "greeting"\nmsgstr "Zdravo %s"\n`,
    );

    const result = await runVerbatra(consumer, ["check", "--json", "--cwd", dir]);

    expect(result.exitCode).toBe(1);
    const summary = checkSummary(result.stdout);
    expect(summary.locales).toEqual([expect.objectContaining({ locale: "sr-Latn", missing: 1 })]);
  });

  it("refuses a script with no gettext modifier before reading any file", async () => {
    const dir = await seedProject("gettext-posix-refused", ["zh-Hant"]);

    const result = await runVerbatra(consumer, ["check", "--json", "--cwd", dir]);

    expect(result.exitCode).toBe(2);
    const envelope = parseEnvelope<unknown>(result.stdout);
    if (envelope.ok) {
      throw new Error("Expected a check error envelope");
    }
    expect(envelope.code).toBe("LOCALE_LAYOUT_INVALID");
    expect(envelope.message).toContain('"zh-Hant"');
    expect(envelope.message).toContain("@latin (Latn)");
  });
});
