import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { contentHash, type TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import {
  baseConfig,
  makeTempDir,
  readJsonFile,
  readTextFile,
  writeJsonFile,
} from "../test-support.js";
import { editEntry } from "./edit-entry.js";

const cfg = (overrides: Partial<VerbatraConfig> = {}): VerbatraConfig =>
  baseConfig({ targetLocales: ["de"], format: "i18next-json", ...overrides });

async function project(
  source: Record<string, unknown>,
  targets: Record<string, Record<string, unknown> | undefined> = {},
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

function sourceEntry(value: string): TranslationEntry {
  return { key: "greeting", namespace: "en", value, placeholders: [], isPlural: false };
}

describe("editEntry: actor", () => {
  it("refuses an actor that is neither human nor agent before writing", async () => {
    const dir = await project({ greeting: "Hello" });

    for (const actor of ["robot", 5, null]) {
      await expect(
        editEntry({
          config: cfg(),
          cwd: dir,
          locale: "de",
          key: "greeting",
          value: "Hallo",
          actor: actor as never,
        }),
      ).rejects.toBeInstanceOf(TypeError);
    }
  });
});

describe("editEntry: locale and key resolution", () => {
  it("throws UNKNOWN_LOCALE for a locale not among the configured target locales", async () => {
    const dir = await project({ greeting: "Hello" });

    await expect(
      editEntry({ config: cfg(), cwd: dir, locale: "fr", key: "greeting", value: "Bonjour" }),
    ).rejects.toMatchObject({ code: "UNKNOWN_LOCALE" });
  });

  it("throws UNKNOWN_KEY for a key not present in the source resource", async () => {
    const dir = await project({ greeting: "Hello" });

    await expect(
      editEntry({ config: cfg(), cwd: dir, locale: "de", key: "missing", value: "Hallo" }),
    ).rejects.toMatchObject({ code: "UNKNOWN_KEY" });
  });

  it.each(["__proto__", "constructor", "__proto__.x"])(
    "rejects the prototype-shaped key %s as UNKNOWN_KEY, never treating it as present",
    async (key) => {
      const dir = await project({ greeting: "Hello" });

      const error = await editEntry({
        config: cfg(),
        cwd: dir,
        locale: "de",
        key,
        value: "anything",
      }).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(SdkError);
      expect((error as SdkError).code).toBe("UNKNOWN_KEY");
    },
  );
});

describe("editEntry: acceptance", () => {
  it("writes the target file, merges just this key, and locks it with the source content hash", async () => {
    const dir = await project(
      { greeting: "Hello", farewell: "Bye" },
      { de: { greeting: "old", farewell: "Tschuess" } },
    );

    const result = await editEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      value: "Hallo",
    });

    expect(result).toEqual({ accepted: true, value: "Hallo" });
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de).toEqual({ greeting: "Hallo", farewell: "Tschuess" });
    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: Record<string, Record<string, string>>;
    };
    expect(lock.locales.de?.greeting).toBe(contentHash(sourceEntry("Hello")));
  });

  it("merges into the lock's existing entries for the locale, leaving unrelated keys' hashes intact", async () => {
    const dir = await project({ greeting: "Hello", farewell: "Bye" }, { de: { greeting: "old" } });
    await writeJsonFile(join(dir, "verbatra.lock.json"), {
      version: 1,
      locales: { de: { farewell: "unrelated-hash" } },
    });

    await editEntry({ config: cfg(), cwd: dir, locale: "de", key: "greeting", value: "Hallo" });

    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: Record<string, Record<string, string>>;
    };
    expect(lock.locales.de).toEqual({
      farewell: "unrelated-hash",
      greeting: contentHash(sourceEntry("Hello")),
    });
  });

  it("creates the target file when it does not yet exist", async () => {
    const dir = await project({ greeting: "Hello" });

    await editEntry({ config: cfg(), cwd: dir, locale: "de", key: "greeting", value: "Hallo" });

    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de).toEqual({ greeting: "Hallo" });
  });

  it("defaults the working directory to process.cwd() when cwd is omitted", async () => {
    const dir = await project({ greeting: "Hello" });
    const previous = process.cwd();
    try {
      process.chdir(dir);
      const result = await editEntry({
        config: cfg(),
        locale: "de",
        key: "greeting",
        value: "Hallo",
      });
      expect(result.accepted).toBe(true);
    } finally {
      process.chdir(previous);
    }
  });
});

describe("editEntry: rejection", () => {
  it("returns accepted: false on a placeholder mismatch and writes nothing", async () => {
    const dir = await project({ greeting: "Hello {{name}}" }, { de: { greeting: "old" } });

    const result = await editEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      value: "Hallo",
    });

    expect(result.accepted).toBe(false);
    expect(result).toMatchObject({ accepted: false, reason: "placeholder", value: "Hallo" });
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de).toEqual({ greeting: "old" });
    const lock = (await readJsonFile(join(dir, "verbatra.lock.json")).catch(() => undefined)) as
      | { locales: Record<string, Record<string, string>> }
      | undefined;
    expect(lock?.locales.de?.greeting).toBeUndefined();
  });

  it("returns accepted: false on invalid ICU message syntax for an ICU-capable format", async () => {
    const dir = await project({ greeting: "Hello world" }, { de: { greeting: "old" } });

    const result = await editEntry({
      config: cfg({ format: "next-intl-json" }),
      cwd: dir,
      locale: "de",
      key: "greeting",
      value: "Hallo {name",
    });

    expect(result).toMatchObject({ accepted: false, reason: "icu" });
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de).toEqual({ greeting: "old" });
  });

  it.each(["", "   ", "\t\n"])(
    "returns accepted: false with reason empty for the value %j, writing nothing",
    async (value) => {
      const dir = await project({ greeting: "Hello" }, { de: { greeting: "Hallo" } });

      const result = await editEntry({
        config: cfg(),
        cwd: dir,
        locale: "de",
        key: "greeting",
        value,
      });

      expect(result).toMatchObject({ accepted: false, reason: "empty" });
      const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
      expect(de).toEqual({ greeting: "Hallo" });
    },
  );

  it("does not feed the cache when an empty value is rejected", async () => {
    const dir = await project({ greeting: "Hello" }, { de: { greeting: "Hallo" } });

    await editEntry({ config: cfg(), cwd: dir, locale: "de", key: "greeting", value: "" });

    const cache = await readJsonFile(join(dir, "verbatra.cache.json")).catch(() => undefined);
    expect(JSON.stringify(cache ?? {})).not.toContain('""');
  });
});

describe("editEntry: stale-key regression", () => {
  it("throws UNKNOWN_KEY, never writing anything, when the key was removed from the source between fetch and submit", async () => {
    const dir = await project({ greeting: "Hello", farewell: "Bye" }, { de: { greeting: "old" } });

    await writeJsonFile(join(dir, "locales", "en.json"), { farewell: "Bye" });

    const error = await editEntry({
      config: cfg(),
      cwd: dir,
      locale: "de",
      key: "greeting",
      value: "Hallo",
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SdkError);
    expect((error as SdkError).code).toBe("UNKNOWN_KEY");
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de).toEqual({ greeting: "old" });
  });
});

describe("editEntry: never touches run-status.json", () => {
  it("leaves a pre-existing run-status file byte-for-byte unchanged after a successful edit", async () => {
    const dir = await project({ greeting: "Hello" });
    const runStatusPath = join(dir, ".verbatra-local", "run-status.json");
    await mkdir(join(dir, ".verbatra-local"));
    await writeJsonFile(runStatusPath, {
      version: 1,
      generatedAt: "2026-01-01T00:00:00.000Z",
      locales: [],
    });
    const before = await readTextFile(runStatusPath);

    await editEntry({ config: cfg(), cwd: dir, locale: "de", key: "greeting", value: "Hallo" });

    const after = await readTextFile(runStatusPath);
    expect(after).toBe(before);
  });
});
