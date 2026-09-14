import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { ProviderError } from "@verbatra/ai-providers";
import { contentHash, type TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import { retranslateEntry } from "./retranslate-entry.js";

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

describe("retranslateEntry: locale and key resolution", () => {
  it("throws UNKNOWN_LOCALE for a locale not among the configured target locales", async () => {
    const dir = await project({ greeting: "Hello" });
    const stub = makeStubProvider();

    await expect(
      retranslateEntry(
        { config: cfg(), cwd: dir, locale: "fr", key: "greeting" },
        { createProvider: () => stub.provider },
      ),
    ).rejects.toMatchObject({ code: "UNKNOWN_LOCALE" });
  });

  it("throws UNKNOWN_KEY for a key not present in the source resource", async () => {
    const dir = await project({ greeting: "Hello" });
    const stub = makeStubProvider();

    await expect(
      retranslateEntry(
        { config: cfg(), cwd: dir, locale: "de", key: "missing" },
        { createProvider: () => stub.provider },
      ),
    ).rejects.toMatchObject({ code: "UNKNOWN_KEY" });
  });

  it.each(["__proto__", "constructor", "__proto__.x"])(
    "rejects the prototype-shaped key %s as UNKNOWN_KEY, never treating it as present",
    async (key) => {
      const dir = await project({ greeting: "Hello" });
      const stub = makeStubProvider();

      const error = await retranslateEntry(
        { config: cfg(), cwd: dir, locale: "de", key },
        { createProvider: () => stub.provider },
      ).catch((e: unknown) => e);

      expect(error).toBeInstanceOf(SdkError);
      expect((error as SdkError).code).toBe("UNKNOWN_KEY");
      expect(stub.calls).toHaveLength(0);
    },
  );
});

describe("retranslateEntry: acceptance", () => {
  it("writes the target file, merges just this key, and locks it with the source content hash", async () => {
    const dir = await project(
      { greeting: "Hello", farewell: "Bye" },
      { de: { greeting: "old", farewell: "Tschuess" } },
    );
    const stub = makeStubProvider();

    const result = await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "greeting" },
      { createProvider: () => stub.provider },
    );

    expect(result).toEqual({ accepted: true, value: "[de] Hello", reviewReasons: [] });
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de).toEqual({ greeting: "[de] Hello", farewell: "Tschuess" });
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
    const stub = makeStubProvider();

    await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "greeting" },
      { createProvider: () => stub.provider },
    );

    const lock = (await readJsonFile(join(dir, "verbatra.lock.json"))) as {
      locales: Record<string, Record<string, string>>;
    };
    expect(lock.locales.de).toEqual({
      farewell: "unrelated-hash",
      greeting: contentHash(sourceEntry("Hello")),
    });
  });

  it("surfaces the provider's reported review reasons for this key", async () => {
    const dir = await project({ greeting: "Hello" });
    const provider = makeStubProvider().provider;
    const reviewingProvider = {
      ...provider,
      translateBatch: async (request: Parameters<typeof provider.translateBatch>[0]) => {
        const base = await provider.translateBatch(request);
        return {
          ...base,
          reviewFlags: new Map([
            ["greeting", { status: "review" as const, reasons: ["EQUALS_SOURCE" as const] }],
          ]),
        };
      },
    };

    const result = await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "greeting" },
      { createProvider: () => reviewingProvider },
    );

    expect(result).toMatchObject({ accepted: true, reviewReasons: ["EQUALS_SOURCE"] });
  });

  it("passes the key's configured length budget to the provider", async () => {
    const dir = await project({ greeting: "Hello" });
    const provider = makeStubProvider().provider;
    let seen: ReadonlyMap<string, number> | undefined;
    const capturingProvider = {
      ...provider,
      translateBatch: async (request: Parameters<typeof provider.translateBatch>[0]) => {
        seen = request.maxLength;
        return provider.translateBatch(request);
      },
    };

    await retranslateEntry(
      { config: cfg({ maxLength: { greeting: 4 } }), cwd: dir, locale: "de", key: "greeting" },
      { createProvider: () => capturingProvider },
    );

    expect(seen?.get("greeting")).toBe(4);
  });

  it("sends no length budget when the config configures none", async () => {
    const dir = await project({ greeting: "Hello" });
    const provider = makeStubProvider().provider;
    let seen: ReadonlyMap<string, number> | undefined = new Map();
    const capturingProvider = {
      ...provider,
      translateBatch: async (request: Parameters<typeof provider.translateBatch>[0]) => {
        seen = request.maxLength;
        return provider.translateBatch(request);
      },
    };

    await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "greeting" },
      { createProvider: () => capturingProvider },
    );

    expect(seen).toBeUndefined();
  });

  it("creates the target file when it does not yet exist", async () => {
    const dir = await project({ greeting: "Hello" });
    const stub = makeStubProvider();

    await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "greeting" },
      { createProvider: () => stub.provider },
    );

    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de).toEqual({ greeting: "[de] Hello" });
  });
});

describe("retranslateEntry: rejection", () => {
  it("returns accepted: false on a placeholder mismatch and writes nothing", async () => {
    const dir = await project({ greeting: "Hello {{name}}" }, { de: { greeting: "old" } });
    const stub = makeStubProvider({ failIntegrity: new Set(["greeting"]) });

    const result = await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "greeting" },
      { createProvider: () => stub.provider },
    );

    expect(result.accepted).toBe(false);
    expect(result).toMatchObject({ accepted: false, reason: "placeholder" });
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de).toEqual({ greeting: "old" });
    const lock = (await readJsonFile(join(dir, "verbatra.lock.json")).catch(() => undefined)) as
      | { locales: Record<string, Record<string, string>> }
      | undefined;
    expect(lock?.locales.de?.greeting).toBeUndefined();
  });

  it("returns accepted: false with reason empty when the provider returns an empty value", async () => {
    const dir = await project({ greeting: "Hello" }, { de: { greeting: "Hallo" } });
    const stub = makeStubProvider({ translate: () => "" });

    const result = await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "greeting" },
      { createProvider: () => stub.provider },
    );

    expect(result).toMatchObject({ accepted: false, reason: "empty" });
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de).toEqual({ greeting: "Hallo" });
  });
});

describe("retranslateEntry: provider errors", () => {
  it("wraps a provider construction failure as PROVIDER_CONSTRUCTION_FAILED", async () => {
    const dir = await project({ greeting: "Hello" });

    await expect(
      retranslateEntry(
        { config: cfg(), cwd: dir, locale: "de", key: "greeting" },
        {
          createProvider: () => {
            throw new Error("no API key configured");
          },
        },
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_CONSTRUCTION_FAILED" });
  });

  it("lets a thrown ProviderError from the provider call propagate unwrapped", async () => {
    const dir = await project({ greeting: "Hello" });
    const error = new ProviderError("AUTH_FAILED", "The configured key is invalid.");
    const throwing = makeStubProvider({ throwForLocales: new Set(["de"]), error });

    await expect(
      retranslateEntry(
        { config: cfg(), cwd: dir, locale: "de", key: "greeting" },
        { createProvider: () => throwing.provider },
      ),
    ).rejects.toBe(error);
  });

  it("throws a ProviderError INVALID_RESPONSE when the provider returns no value for the key", async () => {
    const dir = await project({ greeting: "Hello" });
    const stub = makeStubProvider({ missingValues: new Set(["greeting"]) });

    const error = await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "greeting" },
      { createProvider: () => stub.provider },
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("INVALID_RESPONSE");
  });
});

describe("retranslateEntry: provider request shape", () => {
  it("sends exactly one entry (the requested key), never the whole source resource", async () => {
    const dir = await project({ greeting: "Hello", farewell: "Bye" });
    const stub = makeStubProvider();

    await retranslateEntry(
      { config: cfg(), cwd: dir, locale: "de", key: "greeting" },
      { createProvider: () => stub.provider },
    );

    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]?.request.entries.map((entry) => entry.key)).toEqual(["greeting"]);
    expect(stub.calls[0]?.request.targetLocale).toBe("de");
  });

  it("carries the configured glossary and tone onto the request when set", async () => {
    const dir = await project({ greeting: "Hello" });
    const stub = makeStubProvider();

    await retranslateEntry(
      {
        config: cfg({ glossary: { hello: "salut" }, tone: "formal" }),
        cwd: dir,
        locale: "de",
        key: "greeting",
      },
      { createProvider: () => stub.provider },
    );

    expect(stub.calls[0]?.request.glossary).toEqual({ hello: "salut" });
    expect(stub.calls[0]?.request.tone).toBe("formal");
  });

  it("defaults the working directory to process.cwd() when cwd is omitted", async () => {
    const dir = await project({ greeting: "Hello" });
    const stub = makeStubProvider();
    const previous = process.cwd();
    try {
      process.chdir(dir);
      const result = await retranslateEntry(
        { config: cfg(), locale: "de", key: "greeting" },
        { createProvider: () => stub.provider },
      );
      expect(result.accepted).toBe(true);
    } finally {
      process.chdir(previous);
    }
  });

  it("carries the adapter's branch-aware comparePlaceholders onto the request when the adapter defines one", async () => {
    const dir = await project({ greeting: "Hello" });
    const stub = makeStubProvider();

    await retranslateEntry(
      { config: cfg({ format: "next-intl-json" }), cwd: dir, locale: "de", key: "greeting" },
      { createProvider: () => stub.provider },
    );

    expect(stub.calls[0]?.request.comparePlaceholders).toBeDefined();
  });
});
