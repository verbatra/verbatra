import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import {
  type Consumer,
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
  provider: { id: "anthropic", options: { model: "claude-sonnet-4-6", maxTokens: 4096 } },
};

beforeAll(async () => {
  consumer = await readSharedConsumer();
}, 180_000);

describe("import a structure-locked export directly (no exceljs re-save)", () => {
  it("opens the protected workbook the exporter wrote and exits 0 with nothing applied", async () => {
    const dir = join(consumer.dir, "structure-lock-import");
    await mkdir(dir, { recursive: true });
    await writeJsonIn(dir, ".verbatrarc.json", config);
    await writeJsonIn(dir, "locales/en.json", { greeting: "Hello {{name}}", farewell: "Goodbye" });
    await writeJsonIn(dir, "locales/de.json", { greeting: "Hallo {{name}}" });

    const workbookPath = join(dir, "verbatra-translations.xlsx");
    const exported = await runVerbatra(consumer, ["export", "--out", workbookPath, "--cwd", dir]);
    expect(exported.exitCode).toBe(0);

    const imported = await runVerbatra(consumer, ["import", workbookPath, "--cwd", dir]);
    expect(imported.exitCode).toBe(0);

    const de = await readJsonIn<Record<string, string>>(dir, "locales/de.json");
    expect(de.greeting).toBe("Hallo {{name}}");
    expect(de.farewell).toBeUndefined();
  });
});
