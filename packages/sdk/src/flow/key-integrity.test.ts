import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { contentHash, type TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import {
  baseConfig,
  makeFakeFs,
  makeTempDir,
  realDiskReads,
  writeJsonFile,
} from "../test-support.js";
import { keyIntegrity } from "./key-integrity.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], format: "i18next-json", ...overrides });

async function project(
  source: Record<string, unknown>,
  targets: Record<string, Record<string, unknown> | undefined>,
): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  for (const [locale, obj] of Object.entries(targets)) {
    if (obj !== undefined) {
      await writeJsonFile(join(dir, "locales", `${locale}.json`), obj);
    }
  }
  return dir;
}

function entry(value: string, placeholders: readonly string[] = []): TranslationEntry {
  return { key: "k", namespace: "en", value, placeholders, isPlural: false };
}

async function withBaseline(
  dir: string,
  locale: string,
  source: Record<string, string>,
): Promise<void> {
  const entries: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    entries[key] = contentHash(entry(value));
  }
  await writeJsonFile(join(dir, "verbatra.lock.json"), {
    version: 1,
    locales: { [locale]: entries },
  });
}

describe("keyIntegrity", () => {
  it("reports a matching key with placeholders present on both sides", async () => {
    const source = { greeting: "Hello {{name}} new" };
    const dir = await project(source, { de: { greeting: "Hallo {{name}}" } });
    await withBaseline(dir, "de", { greeting: "Hello {{name}} old" });

    const results = await keyIntegrity({ config: cfg(), cwd: dir });

    expect(results).toEqual([
      {
        locale: "de",
        entries: [
          {
            key: "greeting",
            hasPlaceholders: true,
            matches: true,
            missing: [],
            extra: [],
            icuValid: true,
            markupMatches: true,
            markupDetails: [],
          },
        ],
      },
    ]);
  });

  it("reports a missing-placeholder mismatch when the target drops a source placeholder", async () => {
    const source = { greeting: "Hello {{name}} new" };
    const dir = await project(source, { de: { greeting: "Hallo" } });
    await withBaseline(dir, "de", { greeting: "Hello {{name}} old" });

    const results = await keyIntegrity({ config: cfg(), cwd: dir });

    expect(results[0]?.entries).toEqual([
      {
        key: "greeting",
        hasPlaceholders: true,
        matches: false,
        missing: ["{{name}}"],
        extra: [],
        icuValid: true,
        markupMatches: true,
        markupDetails: [],
      },
    ]);
  });

  it("reports an extra-placeholder mismatch when the target invents a placeholder", async () => {
    const source = { greeting: "Hello new" };
    const dir = await project(source, { de: { greeting: "Hallo {{name}}" } });
    await withBaseline(dir, "de", { greeting: "Hello old" });

    const results = await keyIntegrity({ config: cfg(), cwd: dir });

    expect(results[0]?.entries).toEqual([
      {
        key: "greeting",
        hasPlaceholders: false,
        matches: false,
        missing: [],
        extra: ["{{name}}"],
        icuValid: true,
        markupMatches: true,
        markupDetails: [],
      },
    ]);
  });

  it("reports a key with no placeholders at all as hasPlaceholders: false, matches: true", async () => {
    const source = { plain: "Just text new" };
    const dir = await project(source, { de: { plain: "Nur Text" } });
    await withBaseline(dir, "de", { plain: "Just text old" });

    const results = await keyIntegrity({ config: cfg(), cwd: dir });

    expect(results[0]?.entries).toEqual([
      {
        key: "plain",
        hasPlaceholders: false,
        matches: true,
        missing: [],
        extra: [],
        icuValid: true,
        markupMatches: true,
        markupDetails: [],
      },
    ]);
  });

  it("reports an ICU-format mismatch through the adapter's branch-aware comparePlaceholders", async () => {
    const source = {
      count: "{count, plural, one {# item {name}} other {# items {name}}}",
    };
    const dir = await project(source, {
      de: { count: "{count, plural, one {# Artikel} other {# Artikel}}" },
    });
    await withBaseline(dir, "de", {
      count: "{count, plural, one {# item {name}} other {# items {name}} old}",
    });

    const results = await keyIntegrity({ config: cfg({ format: "arb" }), cwd: dir });

    expect(results[0]?.entries).toHaveLength(1);
    const found = results[0]?.entries[0];
    expect(found?.key).toBe("count");
    expect(found?.matches).toBe(false);
    expect(found?.missing).toContain("{name}");
    expect(found?.icuValid).toBe(true);
  });

  it("falls back to the flat multiset check for a format whose adapter defines no comparator", async () => {
    const source = { greeting: "Hello {name} new" };
    const dir = await project(source, { de: { greeting: "Hallo" } });
    await withBaseline(dir, "de", { greeting: "Hello {name} old" });

    const results = await keyIntegrity({ config: cfg({ format: "vue-i18n-json" }), cwd: dir });

    expect(results[0]?.entries).toEqual([
      expect.objectContaining({ key: "greeting", matches: false, missing: ["{name}"] }),
    ]);
  });

  it("computes icuValid even when the key already fails the placeholder check, never short-circuited", async () => {
    const source = { count: "{count, plural, one {# item} other {# items}}" };
    const dir = await project(source, { de: { count: "{count, plural, one {Eins" } });
    await withBaseline(dir, "de", {
      count: "{count, plural, one {# item} other {# items} old}",
    });

    const results = await keyIntegrity({ config: cfg({ format: "next-intl-json" }), cwd: dir });

    expect(results[0]?.entries).toEqual([
      expect.objectContaining({ key: "count", matches: false, icuValid: false }),
    ]);
  });

  it("reports icuValid: false even when the source carries no placeholders (hasPlaceholders: false, matches trivially true)", async () => {
    const source = { plain: "Just text new" };
    const dir = await project(source, { de: { plain: "Hallo {unbalanced" } });
    await withBaseline(dir, "de", { plain: "Just text old" });

    const results = await keyIntegrity({ config: cfg({ format: "next-intl-json" }), cwd: dir });

    expect(results[0]?.entries).toEqual([
      {
        key: "plain",
        hasPlaceholders: false,
        matches: true,
        missing: [],
        extra: [],
        icuValid: false,
        markupMatches: true,
        markupDetails: [],
      },
    ]);
  });

  it("checks only changed keys, never missing or orphaned ones", async () => {
    const dir = await project(
      { a: "A new", b: "B", c: "C" },
      { de: { b: "Bb", extra: "leftover" } },
    );
    await withBaseline(dir, "de", { a: "A old", b: "B" });

    const results = await keyIntegrity({ config: cfg(), cwd: dir });

    expect(results[0]?.entries).toEqual([]);
  });

  it("narrows to the requested keys via the keys filter, dropping any that are not changed", async () => {
    const dir = await project({ a: "A new", b: "B new" }, { de: { a: "Aa", b: "Bb" } });
    await withBaseline(dir, "de", { a: "A old", b: "B old" });

    const results = await keyIntegrity({ config: cfg(), cwd: dir, keys: ["a", "not-a-real-key"] });

    expect(results[0]?.entries.map((e) => e.key)).toEqual(["a"]);
  });

  it("honors a locales subset", async () => {
    const dir = await project(
      { greeting: "Hello new" },
      { de: { greeting: "Hallo" }, fr: { greeting: "Bonjour" } },
    );
    await withBaseline(dir, "de", { greeting: "Hello old" });
    await withBaseline(dir, "fr", { greeting: "Hello old" });

    const results = await keyIntegrity({
      config: cfg({ targetLocales: ["de", "fr"] }),
      cwd: dir,
      locales: ["fr"],
    });

    expect(results.map((r) => r.locale)).toEqual(["fr"]);
  });

  it("never exposes the full source or target sentence, only the boolean result and placeholder tokens", async () => {
    const longSourceSentence =
      "Welcome {{name}}, this paragraph describes our product in extensive marketing detail that must never leak.";
    const longTargetSentence =
      "Willkommen, dieser lange deutsche Absatz beschreibt unser Produkt ausfuehrlich und darf niemals nach aussen dringen.";
    const dir = await project(
      { greeting: longSourceSentence },
      { de: { greeting: longTargetSentence } },
    );
    await withBaseline(dir, "de", { greeting: "old value, irrelevant to this check" });

    const results = await keyIntegrity({ config: cfg(), cwd: dir });
    const serialized = JSON.stringify(results);

    expect(serialized).not.toContain(longSourceSentence);
    expect(serialized).not.toContain(longTargetSentence);
    expect(serialized).not.toContain("marketing detail");
    expect(serialized).not.toContain("Absatz");
    expect(serialized).toContain("{{name}}");
  });

  it("accepts an injected file system seam, exercising the deps.fs branch instead of the default", async () => {
    const dir = await project({ greeting: "Hello new" }, { de: { greeting: "Hallo" } });
    await withBaseline(dir, "de", { greeting: "Hello old" });

    const fs = makeFakeFs({
      ...realDiskReads(),
      writeFile: async () => {
        throw new Error("keyIntegrity must not write a file");
      },
    });
    const results = await keyIntegrity({ config: cfg(), cwd: dir }, { fs });

    expect(results[0]?.locale).toBe("de");
    expect(results[0]?.entries.map((entry) => entry.key)).toEqual(["greeting"]);
  });

  it("defaults the working directory to process.cwd() when cwd is omitted", async () => {
    const dir = await project({ greeting: "Hello new" }, { de: { greeting: "Hallo" } });
    await withBaseline(dir, "de", { greeting: "Hello old" });
    const previous = process.cwd();
    try {
      process.chdir(dir);
      const results = await keyIntegrity({ config: cfg() });
      expect(results[0]?.locale).toBe("de");
      expect(results[0]?.entries).toEqual([
        {
          key: "greeting",
          hasPlaceholders: false,
          matches: true,
          missing: [],
          extra: [],
          icuValid: true,
          markupMatches: true,
          markupDetails: [],
        },
      ]);
    } finally {
      process.chdir(previous);
    }
  });

  it("throws SOURCE_UNREADABLE when the source file is absent", async () => {
    const dir = await makeTempDir();
    await expect(keyIntegrity({ config: cfg(), cwd: dir })).rejects.toMatchObject({
      code: "SOURCE_UNREADABLE",
    });
  });

  it("throws UNKNOWN_FORMAT when no adapter is registered for the format", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    await expect(
      keyIntegrity({
        config: cfg({ format: "unknown-format" as VerbatraConfig["format"] }),
        cwd: dir,
      }),
    ).rejects.toMatchObject({ code: "UNKNOWN_FORMAT" });
  });

  it("throws UNKNOWN_LOCALE when a requested locale is not configured", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    await expect(keyIntegrity({ config: cfg(), cwd: dir, locales: ["es"] })).rejects.toMatchObject({
      code: "UNKNOWN_LOCALE",
    });
  });

  it("throws LOCK_FILE_INVALID when the lock file is corrupt", async () => {
    const dir = await project({ a: "A" }, { de: { a: "Aa" } });
    await writeJsonFile(join(dir, "verbatra.lock.json"), "not a lock object");
    await expect(keyIntegrity({ config: cfg(), cwd: dir })).rejects.toMatchObject({
      code: "LOCK_FILE_INVALID",
    });
  });
});

describe("keyIntegrity: inline markup already on disk", () => {
  async function markupProject(
    sourceValue: string,
    targetValue: string,
    key = "docs",
  ): Promise<string> {
    const dir = await project({ [key]: sourceValue }, { de: { [key]: targetValue } });
    await withBaseline(dir, "de", { [key]: `${sourceValue} (earlier)` });
    return dir;
  }

  it("reports a translation that dropped a tag pair, naming the tags", async () => {
    const dir = await markupProject('Read <a href="/docs">the docs</a>', "Lies die Doku");

    const [locale] = await keyIntegrity({ config: cfg(), cwd: dir });

    expect(locale?.entries[0]).toMatchObject({
      key: "docs",
      matches: true,
      icuValid: true,
      markupMatches: false,
      markupDetails: ["-</a>", "-<a href>"],
    });
  });

  it("reports a translation whose markup came back mis-nested, with no tag to name", async () => {
    const dir = await markupProject("<b>a</b><i>b</i>", "<b>a<i>b</b></i>", "rich");

    const [locale] = await keyIntegrity({ config: cfg(), cwd: dir });

    expect(locale?.entries[0]).toMatchObject({ markupMatches: false, markupDetails: [] });
  });

  it("reports a faithful translation as matching", async () => {
    const dir = await markupProject(
      'Read <a href="/docs">the docs</a>',
      '<a href="/de/doku">Lies die Doku</a>',
    );

    const [locale] = await keyIntegrity({ config: cfg(), cwd: dir });

    expect(locale?.entries[0]).toMatchObject({ markupMatches: true, markupDetails: [] });
  });

  it("leaves a tag the format reports as a placeholder to the placeholder verdict", async () => {
    const dir = await markupProject("Read <b>the docs</b>", "Lies die Doku", "rich");

    const [locale] = await keyIntegrity({ config: cfg({ format: "next-intl-json" }), cwd: dir });

    expect(locale?.entries[0]).toMatchObject({
      matches: false,
      missing: ["<b>"],
      markupMatches: true,
    });
  });

  it("does not flag prose that merely contains a less-than sign", async () => {
    const dir = await markupProject("Wait < 5 minutes", "Warte < 5 Minuten", "wait");

    const [locale] = await keyIntegrity({ config: cfg(), cwd: dir });

    expect(locale?.entries[0]).toMatchObject({ markupMatches: true });
  });
});
