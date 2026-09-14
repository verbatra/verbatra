import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createDefaultRegistry } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import { CACHE_FILE_NAME } from "../cache/translation-memory.js";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { defaultFs } from "../fs.js";
import { LOCK_FILE_NAME } from "../lock/lock-file.js";
import {
  baseConfig,
  makeFakeFs,
  makeTempDir,
  readJsonFile,
  realDiskReads,
  writeJsonFile,
} from "../test-support.js";
import { gateCandidateValue } from "./integrity-gate.js";
import { pseudolocalize } from "./pseudo.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], format: "i18next-json", ...overrides });

async function project(source: Record<string, unknown>): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  await writeJsonFile(join(dir, "locales", "de.json"), { greeting: "Hallo" });
  return dir;
}

const outputPath = (dir: string, locale = "en-XA"): string =>
  join(dir, ".verbatra-local", "pseudo", "locales", `${locale}.json`);

describe("pseudolocalize: where the output goes", () => {
  it("writes the pseudolocale under the ignored local directory by default", async () => {
    const dir = await project({ greeting: "Hello" });

    const result = await pseudolocalize({ config: cfg(), cwd: dir });

    expect(result.path).toBe(outputPath(dir));
    expect(await readJsonFile(result.path)).toEqual({ greeting: "[Ĥéĺĺó··]" });
  });

  it("defaults to the en-XA pseudolocale", async () => {
    const dir = await project({ greeting: "Hello" });

    expect((await pseudolocalize({ config: cfg(), cwd: dir })).locale).toBe("en-XA");
  });

  it("accepts another pseudolocale code", async () => {
    const dir = await project({ greeting: "Hello" });

    const result = await pseudolocalize({ config: cfg(), cwd: dir, locale: "en-XB" });

    expect(result.path).toBe(outputPath(dir, "en-XB"));
  });

  it("accepts an explicit output directory", async () => {
    const dir = await project({ greeting: "Hello" });

    const result = await pseudolocalize({ config: cfg(), cwd: dir, out: "build/pseudo" });

    expect(result.path).toBe(join(dir, "build", "pseudo", "locales", "en-XA.json"));
  });

  it("leaves the source and target locale files untouched", async () => {
    const dir = await project({ greeting: "Hello" });
    const before = await readFile(join(dir, "locales", "en.json"), "utf8");

    await pseudolocalize({ config: cfg(), cwd: dir });

    expect(await readFile(join(dir, "locales", "en.json"), "utf8")).toBe(before);
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({ greeting: "Hallo" });
  });

  it("writes neither the lock file nor the translation-memory cache", async () => {
    const dir = await project({ greeting: "Hello" });

    await pseudolocalize({ config: cfg(), cwd: dir });

    expect(await defaultFs.fileExists(join(dir, LOCK_FILE_NAME))).toBe(false);
    expect(await defaultFs.fileExists(join(dir, CACHE_FILE_NAME))).toBe(false);
  });
});

describe("pseudolocalize: the destructive case is refused", () => {
  it("refuses a pseudolocale that is the source locale", async () => {
    const dir = await project({ greeting: "Hello" });

    await expect(pseudolocalize({ config: cfg(), cwd: dir, locale: "en" })).rejects.toMatchObject({
      code: "PSEUDO_OUTPUT_CONFLICT",
    });
  });

  it("refuses a pseudolocale that is a configured target locale", async () => {
    const dir = await project({ greeting: "Hello" });

    await expect(pseudolocalize({ config: cfg(), cwd: dir, locale: "DE" })).rejects.toBeInstanceOf(
      SdkError,
    );
  });

  it("refuses an output path that is a configured locale file", async () => {
    const dir = await makeTempDir();
    await writeFile(
      join(dir, "Localizable.xcstrings"),
      `${JSON.stringify({ sourceLanguage: "en", version: "1.0", strings: {} }, null, 2)}\n`,
      "utf8",
    );
    const config = cfg({
      format: "apple-xcstrings",
      files: { pattern: "Localizable{locale}.xcstrings" },
    });

    await expect(pseudolocalize({ config, cwd: dir, out: "." })).rejects.toMatchObject({
      code: "PSEUDO_OUTPUT_CONFLICT",
    });
  });
});

describe("pseudolocalize: every written value clears the project's integrity gate", () => {
  it("accepts every pseudo value against its source entry", async () => {
    const dir = await project({
      greeting: "Hello {{name}}",
      count: "You have {{count}} unread messages waiting",
      nested: "See $t(common.terms) before you continue",
      plain: "Delete this account permanently",
    });
    const adapter = createDefaultRegistry().resolve("", { format: "i18next-json" });
    if (adapter.status !== "resolved") {
      throw new Error("the i18next adapter did not resolve");
    }

    const result = await pseudolocalize({ config: cfg(), cwd: dir });
    const source = await adapter.adapter.read(join(dir, "locales", "en.json"), "en");
    const written = await adapter.adapter.read(result.path, "en-XA");

    for (const [key, entry] of source.resource.entries) {
      const candidate = written.resource.entries.get(key);
      expect(candidate).toBeDefined();
      expect(gateCandidateValue(entry, candidate?.value ?? "", adapter.adapter)).toEqual({
        accepted: true,
      });
    }
  });

  it("reports every source key as transformed when all of them clear the gate", async () => {
    const dir = await project({ a: "Hello there", b: "Goodbye now" });

    const result = await pseudolocalize({ config: cfg(), cwd: dir });

    expect(result).toMatchObject({ entries: 2, transformed: 2, copied: [], written: true });
  });

  it("copies a value the gate would refuse rather than writing a broken one", async () => {
    const dir = await project({ a: "Hello there", runaway: "a".repeat(40) });

    const result = await pseudolocalize({ config: cfg(), cwd: dir });

    expect(result.copied).toEqual(["runaway"]);
    expect(result.transformed).toBe(1);
    expect(await readJsonFile(result.path)).toMatchObject({ runaway: "a".repeat(40) });
  });

  it("copies a value whose source is already invalid for the format", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { broken: "Hi {0 unclosed" });
    const config = cfg({ format: "next-intl-json", targetLocales: ["de"] });

    const result = await pseudolocalize({ config, cwd: dir });

    expect(result.copied).toEqual(["broken"]);
  });
});

describe("pseudolocalize: running it twice changes nothing", () => {
  it("reports the second run as unwritten and leaves the file byte-identical", async () => {
    const dir = await project({ greeting: "Hello", other: "Goodbye" });

    const first = await pseudolocalize({ config: cfg(), cwd: dir });
    const afterFirst = await readFile(first.path, "utf8");
    const second = await pseudolocalize({ config: cfg(), cwd: dir });

    expect(first.written).toBe(true);
    expect(second.written).toBe(false);
    expect(await readFile(second.path, "utf8")).toBe(afterFirst);
  });

  it("rewrites the file when the previous output can no longer be parsed", async () => {
    const dir = await project({ greeting: "Hello" });
    const first = await pseudolocalize({ config: cfg(), cwd: dir });
    await writeFile(first.path, "{ not json", "utf8");

    expect((await pseudolocalize({ config: cfg(), cwd: dir })).written).toBe(true);
  });

  it("rewrites the file once the source changes", async () => {
    const dir = await project({ greeting: "Hello" });
    await pseudolocalize({ config: cfg(), cwd: dir });
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello again" });

    expect((await pseudolocalize({ config: cfg(), cwd: dir })).written).toBe(true);
  });
});

describe("pseudolocalize: shared-catalogue formats", () => {
  it("reports a catalogue it cannot copy rather than writing a partial one", async () => {
    const dir = await makeTempDir();
    await writeFile(
      join(dir, "Localizable.xcstrings"),
      `${JSON.stringify({ sourceLanguage: "en", version: "1.0", strings: {} }, null, 2)}\n`,
      "utf8",
    );
    const config = cfg({
      format: "apple-xcstrings",
      files: { pattern: "Localizable{locale}.xcstrings" },
    });
    let reads = 0;
    const fs = makeFakeFs({
      ...realDiskReads(),
      readFileBounded: async (path: string, maxBytes: number) => {
        reads += 1;
        return reads > 1
          ? { kind: "too-large" as const }
          : defaultFs.readFileBounded(path, maxBytes);
      },
    });

    await expect(pseudolocalize({ config, cwd: dir }, { fs })).rejects.toMatchObject({
      code: "SOURCE_INVALID",
    });
  });

  it("seeds the output catalogue from the source before patching the pseudolocale in", async () => {
    const dir = await makeTempDir();
    const catalogue = {
      sourceLanguage: "en",
      version: "1.0",
      strings: {
        greeting: {
          localizations: { en: { stringUnit: { state: "translated", value: "Hello" } } },
        },
      },
    };
    await writeFile(
      join(dir, "Localizable.xcstrings"),
      `${JSON.stringify(catalogue, null, 2)}\n`,
      "utf8",
    );
    const config = cfg({
      format: "apple-xcstrings",
      files: { pattern: "Localizable{locale}.xcstrings" },
    });

    const result = await pseudolocalize({ config, cwd: dir });
    const written = (await readJsonFile(result.path)) as {
      strings: Record<string, { localizations: Record<string, { stringUnit: { value: string } }> }>;
    };

    expect(written.strings.greeting?.localizations["en-XA"]?.stringUnit.value).toBe("[Ĥéĺĺó··]");
  });
});
