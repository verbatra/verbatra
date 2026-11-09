import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
  TranslateRequest,
  TranslateResult,
  TranslationProvider,
} from "@verbatra/ai-providers";
import {
  AdapterRegistry,
  createDefaultRegistry,
  type FormatAdapter,
} from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { translate } from "../flow/translate-project.js";
import {
  applyValueReplace,
  previewValueReplace,
  type ValueReplaceEntryRef,
} from "../flow/value-replace.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function delayedProvider(base: TranslationProvider, delayMs: number): TranslationProvider {
  return {
    ...base,
    translateBatch: async (request: TranslateRequest): Promise<TranslateResult> => {
      await sleep(delayMs);
      return base.translateBatch(request);
    },
  };
}

function delayedReadRegistry(delayedLocale: string, delayMs: number): AdapterRegistry {
  const resolution = createDefaultRegistry().resolve("", { format: "i18next-json" });
  if (resolution.status !== "resolved") {
    throw new Error("no adapter registered for i18next-json");
  }
  const base = resolution.adapter;
  const delayed: FormatAdapter = {
    ...base,
    read: async (filePath: string, locale: string) => {
      const result = await base.read(filePath, locale);
      if (locale === delayedLocale) {
        await sleep(delayMs);
      }
      return result;
    },
  };
  return new AdapterRegistry().register(delayed);
}

const config: VerbatraConfig = baseConfig({ targetLocales: ["de"], format: "i18next-json" });

async function project(
  source: Record<string, string>,
  target: Record<string, string>,
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  await writeJsonFile(join(dir, "locales", "de.json"), target);
  return dir;
}

async function listedRefs(dir: string): Promise<ValueReplaceEntryRef[]> {
  const listed = await previewValueReplace({ config, cwd: dir, find: "X", replace: "Y" });
  return listed.entries.map(({ locale, key, valueHash }) => ({ locale, key, valueHash }));
}

async function deFile(dir: string): Promise<Record<string, string>> {
  return (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
}

describe("applyValueReplace versus a concurrent CLI translate run on the SAME locale", () => {
  it("loses neither the replaced values nor the translated key", async () => {
    const dir = await project({ greeting: "Hello", farewell: "Goodbye" }, { greeting: "Hallo X" });
    const entries = await listedRefs(dir);
    const stub = makeStubProvider();

    const [result, summary] = await Promise.all([
      applyValueReplace(
        { config, cwd: dir, find: "X", replace: "Y", entries, actor: "human" },
        { adapterRegistry: delayedReadRegistry("de", 30) },
      ),
      translate({ config, cwd: dir }, { createProvider: () => delayedProvider(stub.provider, 5) }),
    ]);

    expect(result.outcomes[0]?.status).toBe("applied");
    expect(summary.failed).toEqual([]);
    expect(await deFile(dir)).toEqual({ greeting: "Hallo Y", farewell: "[de] Goodbye" });
    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: Record<string, Record<string, string>>;
    };
    expect(Object.keys(lock.locales.de ?? {}).sort()).toEqual(["farewell", "greeting"]);
  });
});

describe("two applyValueReplace calls at once on the SAME locale", () => {
  it("applies each value once: the second call finds every value changed", async () => {
    const keys = Array.from({ length: 30 }, (_, index) => `k${index}`);
    const dir = await project(
      Object.fromEntries(keys.map((key) => [key, "Hello"])),
      Object.fromEntries(keys.map((key) => [key, "Hallo X"])),
    );
    const entries = await listedRefs(dir);
    const call = () =>
      applyValueReplace(
        { config, cwd: dir, find: "X", replace: "XX", entries, actor: "human" },
        { adapterRegistry: delayedReadRegistry("de", 10) },
      );

    const [first, second] = await Promise.all([call(), call()]);

    const statuses = [first, second].map((result) => result.counts);
    expect(statuses).toContainEqual({
      applied: 30,
      skipped: 0,
      refused: 0,
      changed: 0,
      "too-long": 0,
    });
    expect(statuses).toContainEqual({
      applied: 0,
      skipped: 0,
      refused: 0,
      changed: 30,
      "too-long": 0,
    });
    const de = await deFile(dir);
    for (const key of keys) {
      expect(de[key]).toBe("Hallo XX");
    }
  });
});
