import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { SUPPORTED_FORMATS, type SupportedFormat, type TranslationEntry } from "@verbatra/core";
import {
  createAndroidXmlAdapter,
  createDefaultRegistry,
  createXliffAdapter,
  type FormatAdapter,
} from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import { defaultFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { makeStubProvider, makeTempDir, writeJsonFile } from "../test-support.js";
import { createBudgetTracker } from "./budget.js";
import { gateCandidateValue } from "./integrity-gate.js";
import { runLocale } from "./locale-run.js";

function i18nextAdapter(): FormatAdapter {
  const resolution = createDefaultRegistry().resolve("", { format: "i18next-json" });
  if (resolution.status !== "resolved") {
    throw new Error("i18next adapter did not resolve");
  }
  return resolution.adapter;
}

function entryFor(adapter: FormatAdapter, value: string): TranslationEntry {
  return {
    key: "greeting",
    namespace: "en",
    value,
    placeholders: adapter.extractPlaceholders(value),
    isPlural: false,
  };
}

describe("gateCandidateValue: a format whose adapter already tokenises its own inline markup", () => {
  it("refuses a dropped XLIFF inline element once, as a placeholder mismatch and not as markup", () => {
    const adapter = createXliffAdapter();
    const source = entryFor(adapter, 'Hello <g id="1">world</g>');
    const result = gateCandidateValue(source, "Hallo Welt", adapter);
    expect(result).toEqual({ accepted: false, reason: "placeholder" });
  });

  it("accepts an XLIFF value whose inline element survives, with no markup opinion of its own", () => {
    const adapter = createXliffAdapter();
    const source = entryFor(adapter, 'Hello <g id="1">world</g>');
    expect(gateCandidateValue(source, 'Hallo <g id="1">Welt</g>', adapter).accepted).toBe(true);
  });

  it("still refuses html-shaped markup an XLIFF value carries that XLIFF does not tokenise", () => {
    const adapter = createXliffAdapter();
    const source = entryFor(adapter, "Read <b>the docs</b>");
    expect(gateCandidateValue(source, "Lies die Doku", adapter)).toEqual({
      accepted: false,
      reason: "markup",
    });
  });
});

describe("gateCandidateValue: android string values carry their markup escaped", () => {
  it("refuses a translation that drops an escaped tag pair", () => {
    const adapter = createAndroidXmlAdapter();
    const source = entryFor(adapter, "Tap <b>Save</b> to continue");
    expect(gateCandidateValue(source, "Tippe auf Speichern", adapter)).toEqual({
      accepted: false,
      reason: "markup",
    });
  });

  it("accepts a translation that keeps the tag pair and the printf placeholder", () => {
    const adapter = createAndroidXmlAdapter();
    const source = entryFor(adapter, "Tap <b>%1$s</b> to continue");
    expect(gateCandidateValue(source, "Tippe auf <b>%1$s</b>", adapter).accepted).toBe(true);
  });
});

async function androidProject(sourceValue: string): Promise<string> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "values"));
  await writeFile(
    join(dir, "values", "en.xml"),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <string name="greeting">${sourceValue}</string>\n</resources>\n`,
    "utf8",
  );
  return dir;
}

describe("runLocale: a markup-mismatched value is withheld on the android-xml path", () => {
  it("never writes it, never lock-records it, and names it in integrityMismatches", async () => {
    const dir = await androidProject("Tap &lt;b&gt;Save&lt;/b&gt; to continue");
    const adapter = createAndroidXmlAdapter();
    const source = (await adapter.read(join(dir, "values", "en.xml"), "en")).resource;
    expect(source.entries.get("greeting")?.value).toBe("Tap <b>Save</b> to continue");

    const { summary, lockEntries } = await runLocale({
      source,
      sourceInvalidIcuKeys: [],
      providerKind: "llm",
      baseline: new Map(),
      maxLength: undefined,
      adapter,
      provider: makeStubProvider({ translate: () => "Tippe auf Speichern" }).provider,
      cwd: dir,
      resolver: createLocalePathResolver(dir, {
        sourceLocale: "en",
        targetLocales: ["de"],
        format: "android-xml",
        files: { pattern: "values/{locale}.xml" },
      }),
      sourceLocale: "en",
      targetLocale: "de",
      format: "android-xml",
      glossary: undefined,
      tone: undefined,
      prune: false,
      generatePlurals: false,
      maxBatchSize: 50,
      fs: defaultFs,
      budget: createBudgetTracker(undefined, "warn"),
    });

    expect(summary.integrityMismatches).toEqual(["greeting"]);
    expect(summary.translated).toEqual([]);
    expect(lockEntries.greeting).toBeUndefined();
    const written = await readFile(join(dir, "values", "de.xml"), "utf8").catch(() => "");
    expect(written).not.toContain("greeting");
  });
});

describe("runLocale: the gate guards the cache-hit and content-duplicate paths too", () => {
  it("withholds a cached value whose markup no longer matches its source", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), {
      one: "Read <b>the docs</b>",
      two: "Read <b>the docs</b>",
    });
    const adapter = i18nextAdapter();
    const source = (await adapter.read(join(dir, "locales", "en.json"), "en")).resource;

    const { summary, lockEntries } = await runLocale({
      source,
      sourceInvalidIcuKeys: [],
      providerKind: "llm",
      baseline: new Map(),
      maxLength: undefined,
      adapter,
      provider: makeStubProvider({ translate: () => "Lies die Doku" }).provider,
      cwd: dir,
      resolver: createLocalePathResolver(dir, {
        sourceLocale: "en",
        targetLocales: ["de"],
        format: "i18next-json",
        files: { pattern: "locales/{locale}.json" },
      }),
      sourceLocale: "en",
      targetLocale: "de",
      format: "i18next-json",
      glossary: undefined,
      tone: undefined,
      prune: false,
      generatePlurals: false,
      maxBatchSize: 50,
      fs: defaultFs,
      budget: createBudgetTracker(undefined, "warn"),
    });

    expect(summary.integrityMismatches).toEqual(["one", "two"]);
    expect(lockEntries.one).toBeUndefined();
    expect(lockEntries.two).toBeUndefined();
  });
});

describe("the markup gate covers every registered format", () => {
  const registry = createDefaultRegistry();

  function adapterFor(format: SupportedFormat): FormatAdapter {
    const resolution = registry.resolve("", { format });
    if (resolution.status !== "resolved") {
      throw new Error(`no adapter resolved for ${format}`);
    }
    return resolution.adapter;
  }

  it.each(SUPPORTED_FORMATS)("%s refuses a dropped attribute-bearing tag as markup", (format) => {
    const adapter = adapterFor(format);
    const source = entryFor(adapter, 'Read <a href="/docs">the docs</a>');
    expect(gateCandidateValue(source, "Lies die Doku", adapter)).toEqual({
      accepted: false,
      reason: "markup",
    });
  });

  const ICU_FORMATS: readonly SupportedFormat[] = ["next-intl-json", "arb"];

  it.each(SUPPORTED_FORMATS.filter((format) => !ICU_FORMATS.includes(format)))(
    "%s accepts the same tag carried through",
    (format) => {
      const adapter = adapterFor(format);
      const source = entryFor(adapter, 'Read <a href="/docs">the docs</a>');
      expect(
        gateCandidateValue(source, '<a href="/de/doku">Lies die Doku</a>', adapter).accepted,
      ).toBe(true);
    },
  );

  it.each(ICU_FORMATS)(
    "%s refuses an attribute-bearing tag as invalid ICU, which the markup comparison does not dispute",
    (format) => {
      const adapter = adapterFor(format);
      const source = entryFor(adapter, 'Read <a href="/docs">the docs</a>');
      expect(gateCandidateValue(source, '<a href="/de/doku">Lies die Doku</a>', adapter)).toEqual({
        accepted: false,
        reason: "icu",
      });
    },
  );

  it.each(SUPPORTED_FORMATS)("%s leaves prose with a bare less-than sign alone", (format) => {
    const adapter = adapterFor(format);
    const source = entryFor(adapter, "Wait < 5 minutes");
    expect(gateCandidateValue(source, "Warte < 5 Minuten", adapter).accepted).toBe(true);
  });

  it.each([
    ["xliff", 'Read <g id="1">the docs</g>'],
    ["next-intl-json", "Read <b>the docs</b>"],
    ["arb", "Read <b>the docs</b>"],
  ] as const)(
    "%s reports a dropped tag it tokenises itself as a placeholder, never twice",
    (format, sourceValue) => {
      const adapter = adapterFor(format);
      const source = entryFor(adapter, sourceValue);
      expect(source.placeholders.some((token) => token.startsWith("<"))).toBe(true);
      expect(gateCandidateValue(source, "Lies die Doku", adapter)).toEqual({
        accepted: false,
        reason: "placeholder",
      });
    },
  );
});
