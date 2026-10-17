import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { retranslateEntry } from "../flow/retranslate-entry.js";
import { translate } from "../flow/translate-project.js";
import type { CreateProvider } from "../selection/select-provider.js";
import { baseConfig, makeStubProvider, makeTempDir, writeJsonFile } from "../test-support.js";
import { loadProvenance } from "./load-provenance.js";

const customCreate: CreateProvider = () => makeStubProvider({ id: "my-provider" }).provider;

const geminiConfig = (targetLocales: readonly string[]) =>
  baseConfig({
    targetLocales: [...targetLocales],
    provider: { id: "gemini", options: { model: "gemini-test", maxOutputTokens: 256 } },
  });

async function project(locale: string, source: Record<string, string>): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  await writeJsonFile(join(dir, "locales", `${locale}.json`), {});
  return dir;
}

async function recordsFor(dir: string, locale: string) {
  return { ...(await loadProvenance({ cwd: dir })).locales[locale] };
}

describe("provenance: a custom createProvider is recorded under its own id", () => {
  it("translate names the resolved provider and drops the configured model", async () => {
    const dir = await project("de", { greeting: "Hello" });

    await translate({ config: geminiConfig(["de"]), cwd: dir }, { createProvider: customCreate });

    const record = (await recordsFor(dir, "de")).greeting;
    expect(record).toMatchObject({ origin: "machine", provider: "my-provider" });
    expect(record?.model).toBeUndefined();
  });

  it("translate names the resolved provider on generated plural forms", async () => {
    const dir = await project("pl", {
      items_one: "{{count}} item",
      items_other: "{{count}} items",
    });

    const summary = await translate(
      { config: geminiConfig(["pl"]), cwd: dir, generatePlurals: true },
      { createProvider: customCreate },
    );

    const generated = summary.locales[0]?.generated ?? [];
    expect(generated.length).toBeGreaterThan(0);
    const records = await recordsFor(dir, "pl");
    for (const key of generated) {
      expect(records[key]).toMatchObject({ origin: "machine", provider: "my-provider" });
      expect(records[key]?.model).toBeUndefined();
    }
  });

  it("retranslateEntry names the resolved provider and drops the configured model", async () => {
    const dir = await project("de", { greeting: "Hello" });

    await retranslateEntry(
      { config: geminiConfig(["de"]), cwd: dir, locale: "de", key: "greeting" },
      { createProvider: customCreate },
    );

    const record = (await recordsFor(dir, "de")).greeting;
    expect(record).toMatchObject({ origin: "machine", provider: "my-provider" });
    expect(record?.model).toBeUndefined();
  });
});
