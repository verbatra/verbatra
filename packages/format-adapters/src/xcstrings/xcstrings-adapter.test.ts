import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { LocaleResource, SupportedFormat, TranslationEntry } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { FormatAdapter } from "../adapter.js";
import { createDefaultRegistry } from "../default-registry.js";
import { AdapterError } from "../errors.js";
import { MAX_INPUT_BYTES } from "../json/limits.js";
import { createAppleXcstringsAdapter } from "./xcstrings-adapter.js";

const adapter = createAppleXcstringsAdapter();

async function tempDir(): Promise<string> {
  return mkdtemp(join(tmpdir(), "verbatra-xcstrings-"));
}

async function tempFile(name: string, content: string): Promise<string> {
  const path = join(await tempDir(), name);
  await writeFile(path, content, "utf8");
  return path;
}

async function readError(promise: Promise<unknown>): Promise<unknown> {
  return promise.catch((error: unknown) => error);
}

function resolveViaRegistry(path: string, format?: SupportedFormat): FormatAdapter {
  const resolution = createDefaultRegistry().resolve(
    path,
    format === undefined ? undefined : { format },
  );
  if (resolution.status !== "resolved") {
    throw new Error(`expected resolved, got ${resolution.status}`);
  }
  return resolution.adapter;
}

function entry(key: string, value: string, isPlural = false): TranslationEntry {
  return {
    key,
    namespace: "Localizable",
    value,
    placeholders: adapter.extractPlaceholders(value),
    isPlural,
  };
}

function makeResource(
  locale: string,
  entries: ReadonlyMap<string, TranslationEntry>,
): LocaleResource {
  return { locale, namespace: "Localizable", format: "apple-xcstrings", entries };
}

const BASE_CATALOGUE = {
  sourceLanguage: "en",
  version: "1.0",
  strings: {
    greeting: {
      localizations: {
        en: { stringUnit: { state: "translated", value: "Hello" } },
        de: { stringUnit: { state: "translated", value: "Hallo" } },
      },
    },
    farewell: {},
    brand: {
      shouldTranslate: false,
      localizations: {
        en: { stringUnit: { state: "translated", value: "Acme" } },
      },
    },
    "%lld photos": {
      localizations: {
        en: {
          variations: {
            plural: {
              one: { stringUnit: { state: "translated", value: "%lld photo" } },
              other: { stringUnit: { state: "translated", value: "%lld photos" } },
            },
          },
        },
        de: {
          variations: {
            plural: {
              one: { stringUnit: { state: "translated", value: "%lld Foto" } },
              other: { stringUnit: { state: "translated", value: "%lld Fotos" } },
            },
          },
        },
      },
    },
  },
};

async function catalogueFile(overrides: Record<string, unknown> = {}): Promise<string> {
  return tempFile("Localizable.xcstrings", JSON.stringify({ ...BASE_CATALOGUE, ...overrides }));
}

describe("createAppleXcstringsAdapter detection", () => {
  it("handles .xcstrings by extension only", () => {
    expect(adapter.canHandle("Localizable.xcstrings")).toBe(true);
    expect(adapter.canHandle("Localizable.strings")).toBe(false);
  });

  it("reports format apple-xcstrings", () => {
    expect(adapter.format).toBe("apple-xcstrings");
  });

  it("resolves through the default registry by extension detection", () => {
    expect(resolveViaRegistry("Localizable.xcstrings").format).toBe("apple-xcstrings");
  });

  it("resolves through the default registry by explicit format", () => {
    expect(resolveViaRegistry("anything", "apple-xcstrings").format).toBe("apple-xcstrings");
  });

  it("has no message syntax to violate", () => {
    expect(adapter.validateMessage("anything at all {not real icu")).toBe(true);
  });
});

describe("createAppleXcstringsAdapter read, plain values", () => {
  it("reads a plain stringUnit value for the requested locale", async () => {
    const path = await catalogueFile();
    const { resource } = await adapter.read(path, "de");
    expect(resource.entries.get("greeting")?.value).toBe("Hallo");
  });

  it("falls back to the key as the value for the document's own sourceLanguage when unset", async () => {
    const path = await catalogueFile();
    const { resource } = await adapter.read(path, "en");
    expect(resource.entries.get("farewell")?.value).toBe("farewell");
  });

  it("omits a key with no entry for a non-source locale, rather than a phantom empty value", async () => {
    const path = await catalogueFile();
    const { resource } = await adapter.read(path, "de");
    expect(resource.entries.has("farewell")).toBe(false);
  });

  it("omits a key entirely missing from a non-source locale's read, so diffing can see it as missing", async () => {
    const path = await catalogueFile();
    const { resource } = await adapter.read(path, "fr");
    expect(resource.entries.has("greeting")).toBe(false);
  });

  it("never omits a source-language key, even one with no explicit source localization", async () => {
    const path = await catalogueFile();
    const { resource } = await adapter.read(path, "en");
    expect(resource.entries.has("farewell")).toBe(true);
  });

  it("falls back to the document's declared sourceLanguage, not just any locale named the same as a config sourceLocale", async () => {
    const path = await catalogueFile({ sourceLanguage: "en-GB" });
    const { resource } = await adapter.read(path, "en-GB");
    expect(resource.entries.get("farewell")?.value).toBe("farewell");
    const enResource = (await adapter.read(path, "en")).resource;
    expect(enResource.entries.has("farewell")).toBe(false);
  });
});

describe("createAppleXcstringsAdapter read, shouldTranslate: false", () => {
  it("excludes a shouldTranslate: false entry from resource.entries", async () => {
    const path = await catalogueFile();
    const { resource } = await adapter.read(path, "en");
    expect(resource.entries.has("brand")).toBe(false);
  });

  it("reports the excluded key through excludedLeafPaths", async () => {
    const path = await catalogueFile();
    const { excludedLeafPaths } = await adapter.read(path, "en");
    expect(excludedLeafPaths).toEqual(["brand"]);
  });
});

describe("createAppleXcstringsAdapter read, plurals", () => {
  it("expands a plural entry into one CLDR-suffixed entry per category present", async () => {
    const path = await catalogueFile();
    const { resource } = await adapter.read(path, "de");
    expect(resource.entries.get("%lld photos_one")?.value).toBe("%lld Foto");
    expect(resource.entries.get("%lld photos_other")?.value).toBe("%lld Fotos");
    expect(resource.entries.get("%lld photos_one")?.isPlural).toBe(true);
  });

  it("does not synthesize a category the locale does not supply", async () => {
    const path = await catalogueFile();
    const { resource } = await adapter.read(path, "de");
    expect(resource.entries.has("%lld photos_few")).toBe(false);
  });

  it("omits every category for a locale with no plural data at all, rather than synthesizing placeholders", async () => {
    const path = await catalogueFile();
    const { resource } = await adapter.read(path, "fr");
    expect(resource.entries.has("%lld photos_one")).toBe(false);
    expect(resource.entries.has("%lld photos_other")).toBe(false);
  });

  it("extracts printf placeholders inside a plural category value, length modifier stripped", async () => {
    const path = await catalogueFile();
    const { resource } = await adapter.read(path, "de");
    expect(resource.entries.get("%lld photos_one")?.placeholders).toEqual(["%d"]);
  });
});

describe("createAppleXcstringsAdapter read, malformed catalogues", () => {
  it("raises INVALID_JSON, naming the file, for unparseable content", async () => {
    const path = await tempFile("Localizable.xcstrings", "{not json");
    const error = await readError(adapter.read(path, "en"));
    expect(error).toBeInstanceOf(AdapterError);
    expect((error as AdapterError).code).toBe("INVALID_JSON");
    expect((error as Error).message).toContain(path);
  });

  it("raises INVALID_STRUCTURE for a top level that is not an object", async () => {
    const path = await tempFile("Localizable.xcstrings", "[]");
    const error = await readError(adapter.read(path, "en"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("raises INVALID_STRUCTURE naming the file for a missing sourceLanguage", async () => {
    const path = await tempFile(
      "Localizable.xcstrings",
      JSON.stringify({ version: "1.0", strings: {} }),
    );
    const error = await readError(adapter.read(path, "en"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    expect((error as Error).message).toContain(path);
    expect((error as Error).message).toContain("sourceLanguage");
  });

  it("raises INVALID_STRUCTURE naming the file for a missing strings object", async () => {
    const path = await tempFile("Localizable.xcstrings", JSON.stringify({ sourceLanguage: "en" }));
    const error = await readError(adapter.read(path, "en"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    expect((error as Error).message).toContain("strings");
  });

  it("raises INVALID_STRUCTURE naming the file and key for a non-object entry", async () => {
    const path = await tempFile(
      "Localizable.xcstrings",
      JSON.stringify({ sourceLanguage: "en", strings: { greeting: "not an object" } }),
    );
    const error = await readError(adapter.read(path, "en"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    expect((error as Error).message).toContain(path);
    expect((error as Error).message).toContain("greeting");
  });

  it("raises INVALID_STRUCTURE naming the file, key, and locale for a localization with neither stringUnit nor plural", async () => {
    const path = await tempFile(
      "Localizable.xcstrings",
      JSON.stringify({
        sourceLanguage: "en",
        strings: { greeting: { localizations: { de: { variations: { deviceClass: {} } } } } },
      }),
    );
    const error = await readError(adapter.read(path, "de"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    const message = (error as Error).message;
    expect(message).toContain(path);
    expect(message).toContain("greeting");
    expect(message).toContain("de");
  });

  it("raises INVALID_STRUCTURE for a stringUnit missing its value field", async () => {
    const path = await tempFile(
      "Localizable.xcstrings",
      JSON.stringify({
        sourceLanguage: "en",
        strings: { greeting: { localizations: { de: { stringUnit: { state: "new" } } } } },
      }),
    );
    const error = await readError(adapter.read(path, "de"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("raises INVALID_STRUCTURE for a plural category variation that is not an object", async () => {
    const path = await tempFile(
      "Localizable.xcstrings",
      JSON.stringify({
        sourceLanguage: "en",
        strings: { count: { localizations: { de: { variations: { plural: { one: "oops" } } } } } },
      }),
    );
    const error = await readError(adapter.read(path, "de"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("raises INVALID_STRUCTURE for an unsupported plural category", async () => {
    const path = await tempFile(
      "Localizable.xcstrings",
      JSON.stringify({
        sourceLanguage: "en",
        strings: {
          count: {
            localizations: {
              de: { variations: { plural: { dual: { stringUnit: { value: "x" } } } } },
            },
          },
        },
      }),
    );
    const error = await readError(adapter.read(path, "de"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    expect((error as Error).message).toContain("dual");
  });

  it("raises INVALID_STRUCTURE for a localizations field that is not an object", async () => {
    const path = await tempFile(
      "Localizable.xcstrings",
      JSON.stringify({ sourceLanguage: "en", strings: { greeting: { localizations: "nope" } } }),
    );
    const error = await readError(adapter.read(path, "en"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    expect((error as Error).message).toContain("greeting");
  });

  it("raises INVALID_STRUCTURE for a localization that is not an object", async () => {
    const path = await tempFile(
      "Localizable.xcstrings",
      JSON.stringify({
        sourceLanguage: "en",
        strings: { greeting: { localizations: { de: "nope" } } },
      }),
    );
    const error = await readError(adapter.read(path, "de"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("raises INVALID_STRUCTURE for a variations.plural field that is not an object", async () => {
    const path = await tempFile(
      "Localizable.xcstrings",
      JSON.stringify({
        sourceLanguage: "en",
        strings: { count: { localizations: { de: { variations: { plural: "nope" } } } } },
      }),
    );
    const error = await readError(adapter.read(path, "de"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
  });

  it("raises INVALID_STRUCTURE for an empty variations.plural object", async () => {
    const path = await tempFile(
      "Localizable.xcstrings",
      JSON.stringify({
        sourceLanguage: "en",
        strings: { count: { localizations: { de: { variations: { plural: {} } } } } },
      }),
    );
    const error = await readError(adapter.read(path, "de"));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    expect((error as Error).message).toContain("no plural categories");
  });

  it("raises INPUT_TOO_LARGE for an oversized catalogue", async () => {
    const path = await tempFile("Localizable.xcstrings", "x".repeat(MAX_INPUT_BYTES + 1));
    const error = await readError(adapter.read(path, "en"));
    expect((error as AdapterError).code).toBe("INPUT_TOO_LARGE");
  });
});

describe("createAppleXcstringsAdapter write", () => {
  it("patches only the touched locale's localization, leaving another locale's untouched", async () => {
    const path = await catalogueFile();
    const before = JSON.parse(await readFile(path, "utf8"));
    const entries = new Map([["greeting", entry("greeting", "Bonjour")]]);
    await adapter.write(makeResource("fr", entries), path);

    const after = JSON.parse(await readFile(path, "utf8"));
    expect(after.strings.greeting.localizations.fr.stringUnit.value).toBe("Bonjour");
    expect(after.strings.greeting.localizations.de).toEqual(
      before.strings.greeting.localizations.de,
    );
    expect(after.strings.greeting.localizations.en).toEqual(
      before.strings.greeting.localizations.en,
    );
  });

  it("sets state translated for a value it just wrote", async () => {
    const path = await catalogueFile();
    const entries = new Map([["greeting", entry("greeting", "Bonjour")]]);
    await adapter.write(makeResource("fr", entries), path);
    const after = JSON.parse(await readFile(path, "utf8"));
    expect(after.strings.greeting.localizations.fr.stringUnit.state).toBe("translated");
  });

  it("leaves an unchanged value's existing localization byte-identical, state included", async () => {
    const path = await catalogueFile();
    const before = JSON.parse(await readFile(path, "utf8"));
    const entries = new Map([["greeting", entry("greeting", "Hallo")]]);
    await adapter.write(makeResource("de", entries), path);
    const after = JSON.parse(await readFile(path, "utf8"));
    expect(after.strings.greeting.localizations.de).toEqual(
      before.strings.greeting.localizations.de,
    );
  });

  it("never writes a shouldTranslate: false entry even if asked to", async () => {
    const path = await catalogueFile();
    const entries = new Map([["brand", entry("brand", "Should not land")]]);
    await adapter.write(makeResource("de", entries), path);
    const after = JSON.parse(await readFile(path, "utf8"));
    expect(after.strings.brand.localizations.de).toBeUndefined();
  });

  it("never touches extractionState", async () => {
    const path = await catalogueFile({
      strings: {
        ...BASE_CATALOGUE.strings,
        greeting: {
          extractionState: "manual",
          localizations: BASE_CATALOGUE.strings.greeting.localizations,
        },
      },
    });
    const entries = new Map([["greeting", entry("greeting", "Bonjour")]]);
    await adapter.write(makeResource("fr", entries), path);
    const after = JSON.parse(await readFile(path, "utf8"));
    expect(after.strings.greeting.extractionState).toBe("manual");
  });

  it("preserves version and sourceLanguage on write", async () => {
    const path = await catalogueFile();
    const entries = new Map([["greeting", entry("greeting", "Bonjour")]]);
    await adapter.write(makeResource("fr", entries), path);
    const after = JSON.parse(await readFile(path, "utf8"));
    expect(after.version).toBe("1.0");
    expect(after.sourceLanguage).toBe("en");
  });

  it("prunes a translatable key absent from resource.entries for that locale", async () => {
    const path = await catalogueFile();
    await adapter.write(makeResource("de", new Map()), path);
    const after = JSON.parse(await readFile(path, "utf8"));
    expect(after.strings.greeting.localizations.de).toBeUndefined();
  });

  it("writes a plural entry's categories under variations.plural", async () => {
    const path = await catalogueFile();
    const entries = new Map([
      ["%lld photos_one", entry("%lld photos_one", "%lld photo fr", true)],
      ["%lld photos_other", entry("%lld photos_other", "%lld photos fr", true)],
    ]);
    await adapter.write(makeResource("fr", entries), path);
    const after = JSON.parse(await readFile(path, "utf8"));
    const plural = after.strings["%lld photos"].localizations.fr.variations.plural;
    expect(plural.one.stringUnit.value).toBe("%lld photo fr");
    expect(plural.other.stringUnit.value).toBe("%lld photos fr");
  });

  it("rewrites a plural entry when one category's value changed", async () => {
    const path = await catalogueFile();
    const first = new Map([
      ["%lld photos_one", entry("%lld photos_one", "%lld photo fr", true)],
      ["%lld photos_other", entry("%lld photos_other", "%lld photos fr", true)],
    ]);
    await adapter.write(makeResource("fr", first), path);
    const second = new Map([
      ["%lld photos_one", entry("%lld photos_one", "%lld photo fr changed", true)],
      ["%lld photos_other", entry("%lld photos_other", "%lld photos fr", true)],
    ]);
    await adapter.write(makeResource("fr", second), path);
    const after = JSON.parse(await readFile(path, "utf8"));
    const plural = after.strings["%lld photos"].localizations.fr.variations.plural;
    expect(plural.one.stringUnit.value).toBe("%lld photo fr changed");
  });

  it("creates a localizations object for an entry that never had one", async () => {
    const path = await catalogueFile();
    const entries = new Map([["farewell", entry("farewell", "Au revoir")]]);
    await adapter.write(makeResource("fr", entries), path);
    const after = JSON.parse(await readFile(path, "utf8"));
    expect(after.strings.farewell.localizations.fr.stringUnit.value).toBe("Au revoir");
  });

  it("treats a malformed existing stringUnit as no current value and rewrites it", async () => {
    const path = await catalogueFile({
      strings: {
        ...BASE_CATALOGUE.strings,
        greeting: {
          localizations: {
            ...BASE_CATALOGUE.strings.greeting.localizations,
            fr: { stringUnit: "oops" },
          },
        },
      },
    });
    const entries = new Map([["greeting", entry("greeting", "Bonjour")]]);
    await adapter.write(makeResource("fr", entries), path);
    const after = JSON.parse(await readFile(path, "utf8"));
    expect(after.strings.greeting.localizations.fr.stringUnit.value).toBe("Bonjour");
  });

  it("treats a malformed existing variations.plural as no current value and rewrites it", async () => {
    const path = await catalogueFile({
      strings: {
        ...BASE_CATALOGUE.strings,
        "%lld photos": {
          localizations: {
            ...BASE_CATALOGUE.strings["%lld photos"].localizations,
            fr: { variations: { plural: "oops" } },
          },
        },
      },
    });
    const entries = new Map([
      ["%lld photos_one", entry("%lld photos_one", "%lld photo fr", true)],
      ["%lld photos_other", entry("%lld photos_other", "%lld photos fr", true)],
    ]);
    await adapter.write(makeResource("fr", entries), path);
    const after = JSON.parse(await readFile(path, "utf8"));
    const plural = after.strings["%lld photos"].localizations.fr.variations.plural;
    expect(plural.one.stringUnit.value).toBe("%lld photo fr");
  });

  it("treats a stringUnit whose value is not a string as no current value and rewrites it", async () => {
    const path = await catalogueFile({
      strings: {
        ...BASE_CATALOGUE.strings,
        greeting: {
          localizations: {
            ...BASE_CATALOGUE.strings.greeting.localizations,
            fr: { stringUnit: { value: 42 } },
          },
        },
      },
    });
    const entries = new Map([["greeting", entry("greeting", "Bonjour")]]);
    await adapter.write(makeResource("fr", entries), path);
    const after = JSON.parse(await readFile(path, "utf8"));
    expect(after.strings.greeting.localizations.fr.stringUnit.value).toBe("Bonjour");
  });

  it("rewrites a key from plural to plain when this run's entries are singular", async () => {
    const path = await catalogueFile();
    const entries = new Map([["%lld photos", entry("%lld photos", "%lld Fotos")]]);
    await adapter.write(makeResource("de", entries), path);
    const after = JSON.parse(await readFile(path, "utf8"));
    expect(after.strings["%lld photos"].localizations.de.stringUnit.value).toBe("%lld Fotos");
    expect(after.strings["%lld photos"].localizations.de.variations).toBeUndefined();
  });

  it("treats a malformed existing plural category as no current value and rewrites it", async () => {
    const path = await catalogueFile({
      strings: {
        ...BASE_CATALOGUE.strings,
        "%lld photos": {
          localizations: {
            ...BASE_CATALOGUE.strings["%lld photos"].localizations,
            fr: { variations: { plural: { one: "oops" } } },
          },
        },
      },
    });
    const entries = new Map([
      ["%lld photos_one", entry("%lld photos_one", "%lld photo fr", true)],
      ["%lld photos_other", entry("%lld photos_other", "%lld photos fr", true)],
    ]);
    await adapter.write(makeResource("fr", entries), path);
    const after = JSON.parse(await readFile(path, "utf8"));
    const plural = after.strings["%lld photos"].localizations.fr.variations.plural;
    expect(plural.other.stringUnit.value).toBe("%lld photos fr");
  });

  it("raises INVALID_STRUCTURE naming the file for a missing destination catalogue", async () => {
    const path = join(await tempDir(), "Localizable.xcstrings");
    const entries = new Map([["greeting", entry("greeting", "Bonjour")]]);
    const error = await readError(adapter.write(makeResource("fr", entries), path));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    expect((error as Error).message).toContain(path);
  });

  it("rethrows a non-missing destination read failure as-is", async () => {
    const path = await tempDir();
    const entries = new Map([["greeting", entry("greeting", "Bonjour")]]);
    const error = await readError(adapter.write(makeResource("fr", entries), path));
    expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    expect((error as Error).message).toBe("The path is not a regular file.");
  });

  it("does not materialize a phantom localization for a key that is still untranslated", async () => {
    const path = await catalogueFile();
    const { resource } = await adapter.read(path, "fr");
    expect(resource.entries.has("greeting")).toBe(false);
    await adapter.write(makeResource("fr", resource.entries), path);
    const after = JSON.parse(await readFile(path, "utf8"));
    expect(after.strings.greeting.localizations.fr).toBeUndefined();
  });

  it("does not materialize a phantom localization for a value explicitly re-supplied as empty", async () => {
    const path = await catalogueFile();
    const entries = new Map([["greeting", entry("greeting", "")]]);
    await adapter.write(makeResource("fr", entries), path);
    const after = JSON.parse(await readFile(path, "utf8"));
    expect(after.strings.greeting.localizations.fr).toBeUndefined();
  });

  it("round-trips a no-op write with no locale changed", async () => {
    const path = await catalogueFile();
    const before = await readFile(path, "utf8");
    const { resource } = await adapter.read(path, "de");
    await adapter.write(makeResource("de", resource.entries), path);
    const after = await readFile(path, "utf8");
    expect(JSON.parse(after)).toEqual(JSON.parse(before));
  });
});

describe("createAppleXcstringsAdapter, multiple locales sharing one catalogue", () => {
  it("keeps every earlier locale's write intact after several sequential writes", async () => {
    const path = await catalogueFile();
    const locales = ["fr", "es", "it"];
    for (const locale of locales) {
      const entries = new Map([["greeting", entry("greeting", `hi-${locale}`)]]);
      await adapter.write(makeResource(locale, entries), path);
    }
    const after = JSON.parse(await readFile(path, "utf8"));
    for (const locale of locales) {
      expect(after.strings.greeting.localizations[locale].stringUnit.value).toBe(`hi-${locale}`);
    }
    expect(after.strings.greeting.localizations.de.stringUnit.value).toBe("Hallo");
    expect(after.strings.greeting.localizations.en.stringUnit.value).toBe("Hello");
  });
});
