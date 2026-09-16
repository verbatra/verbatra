import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  contentHash,
  SUPPORTED_FORMATS,
  type SupportedFormat,
  type TranslationEntry,
} from "@verbatra/core";
import {
  createAndroidXmlAdapter,
  createDefaultRegistry,
  createXliffAdapter,
  type FormatAdapter,
} from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import type { TranslationMemory } from "../cache/types.js";
import { defaultFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import {
  baseConfig,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  writeJsonFile,
} from "../test-support.js";
import { createBudgetTracker } from "./budget.js";
import { editEntry } from "./edit-entry.js";
import { gateCandidateValue } from "./integrity-gate.js";
import { type LocaleRunParams, runLocale } from "./locale-run.js";

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

  it("refuses a surplus XLIFF closing tag the placeholder check cannot see", () => {
    const adapter = createXliffAdapter();
    const source = entryFor(adapter, 'Read <g id="1">the docs</g>');
    expect(gateCandidateValue(source, 'Lies <g id="1">Doku</g></g>', adapter)).toEqual({
      accepted: false,
      reason: "markup",
      details: ["+</g>"],
    });
  });

  it("refuses an XLIFF inline element whose closing tag the candidate dropped", () => {
    const adapter = createXliffAdapter();
    const source = entryFor(adapter, 'Read <g id="1">the docs</g>');
    expect(gateCandidateValue(source, 'Lies <g id="1">Doku', adapter)).toEqual({
      accepted: false,
      reason: "markup",
      details: ["-</g>"],
    });
  });

  it("accepts an XLIFF self-closing inline element carried through", () => {
    const adapter = createXliffAdapter();
    const source = entryFor(adapter, 'Read <x id="1"/> now');
    expect(gateCandidateValue(source, 'Lies <x id="1"/> jetzt', adapter).accepted).toBe(true);
  });

  it("stands down per tag name, so untokenised markup in the same value is still compared", () => {
    const adapter = createXliffAdapter();
    const source = entryFor(adapter, 'Read <g id="1">the docs</g> and <b>this</b>');
    expect(source.placeholders.some((token) => token.startsWith("<"))).toBe(true);
    expect(gateCandidateValue(source, 'Lies <g id="1">die Doku</g> und das', adapter)).toEqual({
      accepted: false,
      reason: "markup",
      details: ["-</b>", "-<b>"],
    });
  });

  it("keeps no markup opinion about the tag it does tokenise", () => {
    const adapter = createXliffAdapter();
    const source = entryFor(adapter, 'Read <g id="1">the docs</g> and <b>this</b>');
    expect(
      gateCandidateValue(source, 'Lies <b>das</b> und <g id="1">die Doku</g>', adapter).accepted,
    ).toBe(true);
  });

  it("names a value that drops both its tokenised and its untokenised markup once", () => {
    const adapter = createXliffAdapter();
    const source = entryFor(adapter, 'Read <g id="1">the docs</g> and <b>this</b>');
    expect(gateCandidateValue(source, "Lies die Doku und das", adapter)).toEqual({
      accepted: false,
      reason: "placeholder",
    });
  });

  it("still refuses html-shaped markup an XLIFF value carries that XLIFF does not tokenise", () => {
    const adapter = createXliffAdapter();
    const source = entryFor(adapter, "Read <b>the docs</b>");
    expect(gateCandidateValue(source, "Lies die Doku", adapter)).toEqual({
      accepted: false,
      reason: "markup",
      details: ["-</b>", "-<b>"],
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
      details: ["-</b>", "-<b>"],
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

describe("runLocale: the gate guards the content-duplicate path too", () => {
  it("withholds a markup-mismatched value from every key that shares its source content", async () => {
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

async function i18nextRun(
  sourceValues: Record<string, string>,
  overrides: Partial<LocaleRunParams>,
): Promise<{ dir: string; result: Awaited<ReturnType<typeof runLocale>> }> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), sourceValues);
  const adapter = i18nextAdapter();
  const source = (await adapter.read(join(dir, "locales", "en.json"), "en")).resource;
  const result = await runLocale({
    source,
    sourceInvalidIcuKeys: [],
    providerKind: "llm",
    baseline: new Map(),
    maxLength: undefined,
    adapter,
    provider: makeStubProvider({ translate: () => "Lies <b>die Doku</b>" }).provider,
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
    ...overrides,
  });
  return { dir, result };
}

function memoryHolding(sourceValue: string, translation: string): TranslationMemory {
  const hash = contentHash(entryFor(i18nextAdapter(), sourceValue));
  return {
    version: 2,
    entries: { fp: { de: { [hash]: translation } } },
    sources: { [hash]: sourceValue },
  };
}

describe("runLocale: the markup gate guards reuse from the translation memory", () => {
  const SOURCE = "Read <b>the docs</b> before you start the installation today";

  it("refuses an exact cache hit whose markup was dropped and asks the provider instead", async () => {
    const stub = makeStubProvider({ translate: () => "Lies <b>die Doku</b>" });
    const { dir, result } = await i18nextRun(
      { docs: SOURCE },
      {
        provider: stub.provider,
        cache: { snapshot: memoryHolding(SOURCE, "Lies die Doku"), fingerprint: "fp" },
      },
    );

    expect(result.summary.cacheHits).toEqual([]);
    expect(stub.calls).toHaveLength(1);
    expect(result.summary.translated).toEqual(["docs"]);
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({
      docs: "Lies <b>die Doku</b>",
    });
  });

  it("serves the same exact cache hit when its markup survives", async () => {
    const stub = makeStubProvider();
    const { result } = await i18nextRun(
      { docs: SOURCE },
      {
        provider: stub.provider,
        cache: { snapshot: memoryHolding(SOURCE, "Lies <b>die Doku</b>"), fingerprint: "fp" },
      },
    );

    expect(result.summary.cacheHits).toEqual(["docs"]);
    expect(stub.calls).toHaveLength(0);
  });

  it("refuses a fuzzy match whose markup was dropped and asks the provider instead", async () => {
    const stub = makeStubProvider({ translate: () => "Lies <b>die Doku</b>" });
    const { dir, result } = await i18nextRun(
      { docs: `${SOURCE}!` },
      {
        provider: stub.provider,
        cache: {
          snapshot: memoryHolding(SOURCE, "Lies die Doku"),
          fingerprint: "fp",
          fuzzy: { threshold: 0.9 },
        },
      },
    );

    expect(result.summary.fuzzyHits).toEqual([]);
    expect(stub.calls).toHaveLength(1);
    expect(await readJsonFile(join(dir, "locales", "de.json"))).toEqual({
      docs: "Lies <b>die Doku</b>",
    });
  });

  it("serves the same fuzzy match when its markup survives", async () => {
    const stub = makeStubProvider();
    const { result } = await i18nextRun(
      { docs: `${SOURCE}!` },
      {
        provider: stub.provider,
        cache: {
          snapshot: memoryHolding(SOURCE, "Lies <b>die Doku</b>"),
          fingerprint: "fp",
          fuzzy: { threshold: 0.9 },
        },
      },
    );

    expect(result.summary.fuzzyHits.map((hit) => hit.key)).toEqual(["docs"]);
    expect(stub.calls).toHaveLength(0);
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
      details: ["-</a>", "-<a href>"],
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

describe("the markup gate on a value whose format tokenises only part of its markup", () => {
  const MIXED_SOURCE = "Read <b>the docs</b>.<br/>Then go.";
  const MIXED_CANDIDATE = "Lies <b>die Doku</b>. Dann los.";

  function adapterFor(format: SupportedFormat): FormatAdapter {
    const resolution = createDefaultRegistry().resolve("", { format });
    if (resolution.status !== "resolved") {
      throw new Error(`no adapter resolved for ${format}`);
    }
    return resolution.adapter;
  }

  it.each(SUPPORTED_FORMATS)("%s refuses the dropped line break", (format) => {
    const adapter = adapterFor(format);
    const source = entryFor(adapter, MIXED_SOURCE);
    expect(gateCandidateValue(source, MIXED_CANDIDATE, adapter)).toEqual({
      accepted: false,
      reason: "markup",
      details: ["-<br>"],
    });
  });

  it.each(["next-intl-json", "arb"] as const)(
    "%s tokenises the bold tag and not the line break, which is what used to pass the whole value",
    (format) => {
      expect(adapterFor(format).extractPlaceholders(MIXED_SOURCE)).toEqual(["<b>"]);
    },
  );
});

describe("the markup gate on a plural message", () => {
  function adapterFor(format: SupportedFormat): FormatAdapter {
    const resolution = createDefaultRegistry().resolve("", { format });
    if (resolution.status !== "resolved") {
      throw new Error(`no adapter resolved for ${format}`);
    }
    return resolution.adapter;
  }

  function pluralEntry(adapter: FormatAdapter, key: string, value: string): TranslationEntry {
    return {
      key,
      namespace: "en",
      value,
      placeholders: adapter.extractPlaceholders(value),
      isPlural: true,
    };
  }

  it.each(["next-intl-json", "arb"] as const)(
    "%s accepts a target language that needs more ICU plural arms, because the tag is a placeholder",
    (format) => {
      const adapter = adapterFor(format);
      const source = pluralEntry(
        adapter,
        "apples",
        "{count, plural, one {<b>one</b> apple} other {<b>#</b> apples}}",
      );
      const candidate =
        "{count, plural, one {<b>jedno</b> jablko} few {<b>#</b> jablka} many {<b>#</b> jablek} other {<b>#</b> jablka}}";
      expect(gateCandidateValue(source, candidate, adapter).accepted).toBe(true);
    },
  );

  it.each(["next-intl-json", "arb"] as const)(
    "%s still refuses an ICU plural arm that dropped a tag the format does not tokenise",
    (format) => {
      const adapter = adapterFor(format);
      const source = pluralEntry(adapter, "apples", "{count, plural, other {<b>#</b><br/>apples}}");
      expect(
        gateCandidateValue(source, "{count, plural, other {<b>#</b> jablka}}", adapter),
      ).toEqual({ accepted: false, reason: "markup", details: ["-<br>"] });
    },
  );

  it("does not relax counting for a key that merely ends in a plural suffix", () => {
    const adapter = adapterFor("i18next-json");
    const source = pluralEntry(adapter, "items_other", "<b>a</b> and <b>b</b>");
    expect(source.isPlural).toBe(true);
    expect(gateCandidateValue(source, "<b>a</b> und b", adapter)).toEqual({
      accepted: false,
      reason: "markup",
      details: ["-</b>", "-<b>"],
    });
  });

  it("judges a plural-suffixed key exactly as it judges an ordinary one", () => {
    const adapter = adapterFor("i18next-json");
    const value = "<b>a</b> and <b>b</b>";
    const candidate = "<b>a</b> und b";
    expect(
      gateCandidateValue(pluralEntry(adapter, "items_other", value), candidate, adapter),
    ).toEqual(gateCandidateValue(entryFor(adapter, value), candidate, adapter));
  });

  it("refuses an arm-separated value whose markup was rewrapped around the separator", () => {
    const adapter = adapterFor("vue-i18n-json");
    const source = pluralEntry(adapter, "apples", "<b>one</b> apple | <b>{count}</b> apples");
    expect(gateCandidateValue(source, "<b>ein Apfel | {count} Aepfel</b>", adapter)).toEqual({
      accepted: false,
      reason: "markup",
      details: ["-</b>", "-<b>"],
    });
  });

  it("refuses an arm-separated value that grew an arm, the documented limit of this format", () => {
    const adapter = adapterFor("vue-i18n-json");
    const source = pluralEntry(adapter, "apples", "<b>one</b> apple | <b>many</b> apples");
    expect(
      gateCandidateValue(
        source,
        "<b>jedno</b> jablko | <b>kilka</b> jablka | <b>duzo</b> jablek",
        adapter,
      ),
    ).toEqual({ accepted: false, reason: "markup", details: ["+</b>", "+<b>"] });
  });
});

describe("the markup gate on an ICU-style plural in a format that does not parse ICU", () => {
  it.each(["i18next-json", "ngx-translate-json", "yaml"] as const)(
    "%s refuses a translation that adds plural arms, the documented limit of this format",
    (format) => {
      const resolution = createDefaultRegistry().resolve("", { format });
      if (resolution.status !== "resolved") {
        throw new Error(`no adapter resolved for ${format}`);
      }
      const adapter = resolution.adapter;
      const source = entryFor(
        adapter,
        "{count, plural, one {<b>one</b> apple} other {<b>many</b> apples}}",
      );
      const candidate =
        "{count, plural, one {<b>jedno</b> jablko} few {<b>kilka</b> jablka} other {<b>duzo</b> jablek}}";
      expect(gateCandidateValue(source, candidate, adapter)).toEqual({
        accepted: false,
        reason: "markup",
        details: ["+</b>", "+<b>"],
      });
    },
  );
});

describe("the markup gate on a reorder that nests a tag inside another of the same name", () => {
  it("refuses two sibling anchors that come back nested, with no single tag to name", () => {
    const adapter = i18nextAdapter();
    const source = entryFor(adapter, '<a href="/a">one</a> and <a href="/b">two</a>');
    expect(
      gateCandidateValue(source, '<a href="/a">eins und <a href="/b">zwei</a></a>', adapter),
    ).toEqual({ accepted: false, reason: "markup" });
  });

  it("still accepts an ordinary sibling reorder", () => {
    const adapter = i18nextAdapter();
    const source = entryFor(adapter, '<a href="/a">one</a> and <a href="/b">two</a>');
    expect(
      gateCandidateValue(source, '<a href="/b">zwei</a> und <a href="/a">eins</a>', adapter)
        .accepted,
    ).toBe(true);
  });
});

describe("the markup gate on the two spellings of a void element", () => {
  it("accepts a line break rewritten from self-closing to bare", () => {
    const adapter = i18nextAdapter();
    expect(
      gateCandidateValue(entryFor(adapter, "One<br/>two"), "Eins<br>zwei", adapter).accepted,
    ).toBe(true);
  });

  it("accepts a line break rewritten from bare to self-closing", () => {
    const adapter = i18nextAdapter();
    expect(
      gateCandidateValue(entryFor(adapter, "One<br>two"), "Eins<br/>zwei", adapter).accepted,
    ).toBe(true);
  });
});

describe("the tags behind a refusal reach the single-key write paths", () => {
  it("editEntry echoes them back so a review UI can say which tag was dropped", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), {
      greeting: 'Read <a href="/docs">the docs</a>',
    });
    const result = await editEntry({
      config: baseConfig({ targetLocales: ["de"], format: "i18next-json", sourceLocale: "en" }),
      cwd: dir,
      locale: "de",
      key: "greeting",
      value: "Lies die Doku",
    });
    expect(result).toMatchObject({
      accepted: false,
      reason: "markup",
      details: ["-</a>", "-<a href>"],
    });
  });

  it("editEntry carries no details for a reason that has no tag to name", async () => {
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    await writeJsonFile(join(dir, "locales", "en.json"), { greeting: "Hello {{name}}" });
    const result = await editEntry({
      config: baseConfig({ targetLocales: ["de"], format: "i18next-json", sourceLocale: "en" }),
      cwd: dir,
      locale: "de",
      key: "greeting",
      value: "Hallo",
    });
    expect(result).toEqual({ accepted: false, reason: "placeholder", value: "Hallo" });
  });
});

describe("the markup gate on a second spelling of a tag the format reports", () => {
  it.each(["next-intl-json", "arb"] as const)(
    "%s refuses a self-closing tag deleted beside the paired one it does report",
    (format) => {
      const resolution = createDefaultRegistry().resolve("", { format });
      if (resolution.status !== "resolved") {
        throw new Error(`no adapter resolved for ${format}`);
      }
      const adapter = resolution.adapter;
      const source = entryFor(adapter, "Read <b>the docs</b> and <b/>");
      expect(source.placeholders).toEqual(["<b>"]);
      expect(gateCandidateValue(source, "Lies <b>die Doku</b>", adapter)).toEqual({
        accepted: false,
        reason: "markup",
        details: ["-<b/>"],
      });
    },
  );

  it("accepts the same value when the second spelling survives", () => {
    const resolution = createDefaultRegistry().resolve("", { format: "next-intl-json" });
    if (resolution.status !== "resolved") {
      throw new Error("next-intl adapter did not resolve");
    }
    const adapter = resolution.adapter;
    const source = entryFor(adapter, "Read <b>the docs</b> and <b/>");
    expect(gateCandidateValue(source, "Lies <b>die Doku</b> und <b/>", adapter).accepted).toBe(
      true,
    );
  });

  it("still ignores the closing tag that pairs with the reported opening one", () => {
    const adapter = createXliffAdapter();
    const source = entryFor(adapter, 'Read <g id="1">the docs</g>');
    expect(gateCandidateValue(source, 'Lies <g id="1">die Doku</g>', adapter).accepted).toBe(true);
  });
});
