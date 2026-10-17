import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
  fillWorkbook,
  readJsonIn,
  readSharedConsumer,
  runVerbatra,
  writeJsonIn,
} from "../src/harness.js";

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
  await fillWorkbook(workbookPath, (key) => values[key]);
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
