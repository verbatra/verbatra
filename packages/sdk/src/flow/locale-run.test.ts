import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  createAnthropicProvider,
  ProviderError,
  type TranslationProvider,
} from "@verbatra/ai-providers";
import type { LocaleResource, PlaceholderIntegrityResult } from "@verbatra/core";
import {
  createAndroidXmlAdapter,
  createDefaultRegistry,
  createGettextAdapter,
  createNextIntlJsonAdapter,
  type FormatAdapter,
} from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import { defaultFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import {
  makeIntegrityProvider,
  makeStubProvider,
  makeTempDir,
  readJsonFile,
  readTextFile,
  writeJsonFile,
} from "../test-support.js";
import { createBudgetTracker } from "./budget.js";
import { type LocaleRunParams, runLocale } from "./locale-run.js";

function anthropicStubProvider(
  translations: ReadonlyArray<{ key: string; value: string }>,
): TranslationProvider {
  return createAnthropicProvider(
    { model: "claude-sonnet-4-5", maxTokens: 1024 },
    {
      client: {
        messages: {
          create: () =>
            Promise.resolve({
              content: [
                {
                  type: "tool_use",
                  id: "t1",
                  name: "submit_translations",
                  input: { translations },
                },
              ],
            }),
        },
      },
    },
  );
}

function i18nextAdapter(): FormatAdapter {
  const resolution = createDefaultRegistry().resolve("", { format: "i18next-json" });
  if (resolution.status !== "resolved") {
    throw new Error("i18next adapter did not resolve");
  }
  return resolution.adapter;
}

const adapter = i18nextAdapter();

async function setup(
  source: Record<string, unknown>,
  target?: Record<string, unknown>,
): Promise<{ dir: string; sourceResource: LocaleResource }> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  if (target !== undefined) {
    await writeJsonFile(join(dir, "locales", "de.json"), target);
  }
  const sourceResource = (await adapter.read(join(dir, "locales", "en.json"), "en")).resource;
  return { dir, sourceResource };
}

async function setupWithAdapter(
  targetAdapter: FormatAdapter,
  source: Record<string, unknown>,
): Promise<{ dir: string; sourceResource: LocaleResource }> {
  const dir = await makeTempDir();
  await mkdir(join(dir, "locales"));
  await writeJsonFile(join(dir, "locales", "en.json"), source);
  const sourceResource = (await targetAdapter.read(join(dir, "locales", "en.json"), "en")).resource;
  return { dir, sourceResource };
}

function makeParams(
  base: { source: LocaleResource; cwd: string },
  overrides: Partial<LocaleRunParams> = {},
): LocaleRunParams {
  return {
    source: base.source,
    sourceInvalidIcuKeys: [],
    baseline: new Map(),
    adapter,
    provider: makeStubProvider().provider,
    cwd: base.cwd,
    resolver: createLocalePathResolver(base.cwd, {
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
  };
}

function targetPath(dir: string, locale: string): string {
  return join(dir, "locales", `${locale}.json`);
}

describe("runLocale: dry-run", () => {
  it("reports what would be translated and writes nothing, with no lock entries", async () => {
    const { dir, sourceResource } = await setup({ a: "A", b: "B" }, { a: "da" });
    const params = makeParams({ source: sourceResource, cwd: dir }, { provider: undefined });

    const { summary, lockEntries } = await runLocale(params);

    expect(summary.translated).toEqual(["b"]);
    expect(summary.unchanged).toEqual(["a"]);
    expect(lockEntries).toEqual({});
    const de = (await readJsonFile(targetPath(dir, "de"))) as Record<string, string>;
    expect(de).toEqual({ a: "da" });
  });
});

describe("runLocale: translate and write", () => {
  it("translates the missing keys, writes the file, and locks every written key", async () => {
    const { dir, sourceResource } = await setup({ a: "A", b: "B" });
    const stub = makeStubProvider();
    const params = makeParams({ source: sourceResource, cwd: dir }, { provider: stub.provider });

    const { summary, lockEntries } = await runLocale(params);

    expect([...summary.translated].sort()).toEqual(["a", "b"]);
    const de = (await readJsonFile(targetPath(dir, "de"))) as Record<string, string>;
    expect(de).toEqual({ a: "[de] A", b: "[de] B" });
    expect(Object.keys(lockEntries).sort()).toEqual(["a", "b"]);
  });
});

describe("runLocale: new-key append order", () => {
  it("appends new keys after the target's existing keys in source-document order, not alphabetically", async () => {
    const { dir, sourceResource } = await setup(
      { zebra: "Z", alpha: "A", mango: "M" },
      { mango: "[de] M" },
    );
    expect([...sourceResource.entries.keys()]).toEqual(["zebra", "alpha", "mango"]);
    const stub = makeStubProvider();
    const params = makeParams({ source: sourceResource, cwd: dir }, { provider: stub.provider });

    await runLocale(params);

    const de = (await readJsonFile(targetPath(dir, "de"))) as Record<string, string>;
    expect(Object.keys(de)).toEqual(["mango", "zebra", "alpha"]);
    expect(de.mango).toBe("[de] M");
  });
});

describe("runLocale: withholding", () => {
  it("reports a thrown provider call under providerFailures, not integrityMismatches", async () => {
    const { dir, sourceResource } = await setup({ a: "A" });
    const throwing = makeStubProvider({ throwForLocales: new Set(["de"]) });
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      { provider: throwing.provider },
    );

    const { summary, lockEntries } = await runLocale(params);

    expect(summary.translated).toEqual([]);
    expect(summary.providerFailures).toEqual(["a"]);
    expect(summary.integrityMismatches).toEqual([]);
    expect(summary.notices.map((n) => n.code)).toContain("SUB_BATCH_FAILED");
    expect(lockEntries).toEqual({});
  });

  it("carries a thrown ProviderError's secret-free code and message onto the notice", async () => {
    const { dir, sourceResource } = await setup({ a: "A" });
    const error = new ProviderError(
      "MISSING_API_KEY",
      "The ANTHROPIC_API_KEY variable is not set.",
    );
    const throwing = makeStubProvider({ throwForLocales: new Set(["de"]), error });
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      { provider: throwing.provider },
    );

    const { summary } = await runLocale(params);

    expect(summary.providerFailures).toEqual(["a"]);
    const notice = summary.notices.find((n) => n.code === "SUB_BATCH_FAILED");
    expect(notice?.message).toContain("MISSING_API_KEY");
    expect(notice?.message).toContain("The ANTHROPIC_API_KEY variable is not set.");
  });

  it("never leaks a raw non-ProviderError message onto the notice", async () => {
    const { dir, sourceResource } = await setup({ a: "A" });
    const error = Object.assign(new Error("secret request body leaked here"), {
      code: "PROVIDER_ERROR",
    });
    const throwing = makeStubProvider({ throwForLocales: new Set(["de"]), error });
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      { provider: throwing.provider },
    );

    const { summary } = await runLocale(params);

    expect(summary.providerFailures).toEqual(["a"]);
    const noticeText = summary.notices.map((n) => n.message).join(" ");
    expect(noticeText).not.toContain("secret request body leaked here");
    expect(noticeText).toContain("PROVIDER_CALL_FAILED");
  });

  it("withholds a key still missing from the response under providerFailures, not integrityMismatches", async () => {
    const { dir, sourceResource } = await setup({ a: "A", b: "B" });
    const stub = makeStubProvider({ missingValues: new Set(["a"]) });
    const params = makeParams({ source: sourceResource, cwd: dir }, { provider: stub.provider });

    const { summary, lockEntries } = await runLocale(params);

    expect(summary.translated).toEqual(["b"]);
    expect(summary.providerFailures).toEqual(["a"]);
    expect(summary.integrityMismatches).toEqual([]);
    expect(lockEntries.a).toBeUndefined();
    expect(lockEntries.b).toBeDefined();
  });

  it("carries the prior baseline hash for a key still missing from the response (withheld-carry)", async () => {
    const { dir, sourceResource } = await setup({ a: "A", b: "B" }, { a: "[de] old", b: "[de] B" });
    const stub = makeStubProvider({ missingValues: new Set(["a"]) });
    const baseline = new Map([
      ["a", "stale-hash"],
      ["b", "matches-but-unused"],
    ]);
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      { provider: stub.provider, baseline },
    );

    const { summary, lockEntries } = await runLocale(params);

    expect(summary.providerFailures).toEqual(["a"]);
    expect(lockEntries.a).toBe("stale-hash");
  });

  it("withholds a key whose translation fails the integrity check", async () => {
    const { dir, sourceResource } = await setup({ a: "A", b: "B" });
    const stub = makeStubProvider({ failIntegrity: new Set(["a"]) });
    const params = makeParams({ source: sourceResource, cwd: dir }, { provider: stub.provider });

    const { summary, lockEntries } = await runLocale(params);

    expect(summary.translated).toEqual(["b"]);
    expect(summary.integrityMismatches).toEqual(["a"]);
    expect(lockEntries.a).toBeUndefined();
    expect(lockEntries.b).toBeDefined();
  });

  it("carries the prior baseline hash for a withheld changed key (withheld-carry)", async () => {
    const { dir, sourceResource } = await setup({ a: "A", b: "B" }, { a: "[de] old", b: "[de] B" });
    const stub = makeStubProvider({ failIntegrity: new Set(["a"]) });
    const baseline = new Map([
      ["a", "stale-hash"],
      ["b", "matches-but-unused"],
    ]);
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      { provider: stub.provider, baseline },
    );

    const { summary, lockEntries } = await runLocale(params);

    expect(summary.integrityMismatches).toEqual(["a"]);
    expect(lockEntries.a).toBe("stale-hash");
  });

  it("withholds a degenerate provider value, keeps the prior good value on disk, and carries its lock hash", async () => {
    const { dir, sourceResource } = await setup(
      { greeting: "Something went wrong here", farewell: "See you soon everyone" },
      { greeting: "[de] known good greeting" },
    );
    const degenerate = `//* ${"error: ".repeat(24)}[]`;
    const provider = makeIntegrityProvider((value, key) =>
      key === "greeting" ? degenerate : `[de] ${value}`,
    );
    const baseline = new Map([["greeting", "stale-hash"]]);
    const params = makeParams({ source: sourceResource, cwd: dir }, { provider, baseline });

    const { summary, lockEntries } = await runLocale(params);

    expect(summary.integrityMismatches).toEqual(["greeting"]);
    expect(summary.translated).toEqual(["farewell"]);
    const de = (await readJsonFile(targetPath(dir, "de"))) as Record<string, string>;
    expect(de.greeting).toBe("[de] known good greeting");
    expect(lockEntries.greeting).toBe("stale-hash");
  });
});

describe("runLocale: reordered placeholders", () => {
  it("accepts and writes a translation that reorders the same placeholder multiset", async () => {
    const { dir, sourceResource } = await setup({ pair: "{{a}} {{b}}" });
    const provider = makeIntegrityProvider((value) =>
      value.replace("{{a}} {{b}}", "{{b}} und {{a}}"),
    );
    const params = makeParams({ source: sourceResource, cwd: dir }, { provider });

    const { summary, lockEntries } = await runLocale(params);

    expect(summary.translated).toEqual(["pair"]);
    expect(summary.integrityMismatches).toEqual([]);
    const de = (await readJsonFile(targetPath(dir, "de"))) as Record<string, string>;
    expect(de.pair).toBe("{{b}} und {{a}}");
    expect(lockEntries.pair).toBeDefined();
  });
});

describe("runLocale: invalid-ICU source keys", () => {
  it("skips invalid-ICU candidate keys, reports them, and never locks them", async () => {
    const { dir, sourceResource } = await setup({ a: "A", b: "B" });
    const stub = makeStubProvider();
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      { provider: stub.provider, sourceInvalidIcuKeys: ["a"] },
    );

    const { summary, lockEntries } = await runLocale(params);

    expect(summary.invalidIcuSource).toEqual(["a"]);
    expect(summary.translated).toEqual(["b"]);
    expect(stub.calls.flatMap((c) => c.request.entries.map((e) => e.key))).toEqual(["b"]);
    expect(lockEntries.a).toBeUndefined();
    expect(lockEntries.b).toBeDefined();
  });
});

describe("runLocale: pruning and orphans", () => {
  it("prunes an orphaned key from the file and the lock when prune is on", async () => {
    const { dir, sourceResource } = await setup({ a: "A" }, { a: "da", orphan: "x" });
    const stub = makeStubProvider();
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      { provider: stub.provider, prune: true },
    );

    const { summary, lockEntries } = await runLocale(params);

    expect(summary.orphaned).toEqual(["orphan"]);
    expect(summary.pruned).toEqual(["orphan"]);
    const de = (await readJsonFile(targetPath(dir, "de"))) as Record<string, string>;
    expect(de.orphan).toBeUndefined();
    expect(lockEntries.orphan).toBeUndefined();
  });

  it("keeps an orphaned key when prune is off and never gives it a lock entry", async () => {
    const { dir, sourceResource } = await setup({ a: "A" }, { a: "da", orphan: "x" });
    const stub = makeStubProvider();
    const params = makeParams({ source: sourceResource, cwd: dir }, { provider: stub.provider });

    const { summary, lockEntries } = await runLocale(params);

    expect(summary.orphaned).toEqual(["orphan"]);
    expect(summary.pruned).toEqual([]);
    const de = (await readJsonFile(targetPath(dir, "de"))) as Record<string, string>;
    expect(de.orphan).toBe("x");
    expect(lockEntries.orphan).toBeUndefined();
  });

  it("keeps a target-only gettext plural index (a target needing more plural forms than the source declares) when prune is off (default)", async () => {
    const gettext = createGettextAdapter();
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    const enPo = [
      'msgid ""',
      'msgstr ""',
      '"Content-Type: text/plain; charset=UTF-8\\n"',
      '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"',
      "",
      'msgid "one item"',
      'msgid_plural "%d items"',
      'msgstr[0] "one item"',
      'msgstr[1] "%d items"',
      "",
      'msgid "Hello"',
      'msgstr "Hello"',
      "",
    ].join("\n");
    const plPo = [
      'msgid ""',
      'msgstr ""',
      '"Content-Type: text/plain; charset=UTF-8\\n"',
      '"Plural-Forms: nplurals=3; plural=(n==1 ? 0 : n%10>=2 && n%10<=4 && ' +
        '(n%100<10 || n%100>=20) ? 1 : 2);\\n"',
      "",
      'msgid "one item"',
      'msgid_plural "%d items"',
      'msgstr[0] "jeden element"',
      'msgstr[1] "kilka elementow"',
      'msgstr[2] "wiele elementow"',
      "",
    ].join("\n");
    await writeFile(join(dir, "locales", "en.po"), enPo, "utf8");
    await writeFile(join(dir, "locales", "pl.po"), plPo, "utf8");
    const sourceResource = (await gettext.read(join(dir, "locales", "en.po"), "en")).resource;
    const stub = makeStubProvider();
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      {
        provider: stub.provider,
        adapter: gettext,
        format: "gettext-po",
        targetLocale: "pl",
        resolver: createLocalePathResolver(dir, {
          sourceLocale: "en",
          targetLocales: ["pl"],
          format: "gettext-po",
          files: { pattern: "locales/{locale}.po" },
        }),
      },
    );

    const { summary, lockEntries } = await runLocale(params);

    expect(summary.translated).toEqual(["Hello"]);
    expect(summary.orphaned).toEqual(["one item[2]"]);
    expect(summary.pruned).toEqual([]);
    expect(lockEntries["one item[2]"]).toBeUndefined();
    const written = await readTextFile(join(dir, "locales", "pl.po"));
    expect(written).toContain('msgstr[2] "wiele elementow"');
    const rewritten = await gettext.read(join(dir, "locales", "pl.po"), "pl");
    expect(rewritten.resource.entries.get("one item[2]")?.value).toBe("wiele elementow");
  });

  it("keeps a target-only android-xml plural quantity (a target needing more plural forms than the source declares) when prune is off (default)", async () => {
    const androidXml = createAndroidXmlAdapter();
    const dir = await makeTempDir();
    await mkdir(join(dir, "locales"));
    const enXml =
      '<?xml version="1.0" encoding="utf-8"?>\n' +
      "<resources>\n" +
      '  <plurals name="count">\n' +
      '    <item quantity="one">%d song</item>\n' +
      '    <item quantity="other">%d songs</item>\n' +
      "  </plurals>\n" +
      '  <string name="hello">Hello</string>\n' +
      "</resources>\n";
    const plXml =
      '<?xml version="1.0" encoding="utf-8"?>\n' +
      "<resources>\n" +
      '  <plurals name="count">\n' +
      '    <item quantity="one">1 utwor</item>\n' +
      '    <item quantity="few">kilka utworow</item>\n' +
      '    <item quantity="other">wiele utworow</item>\n' +
      "  </plurals>\n" +
      "</resources>\n";
    await writeFile(join(dir, "locales", "en.xml"), enXml, "utf8");
    await writeFile(join(dir, "locales", "pl.xml"), plXml, "utf8");
    const sourceResource = (await androidXml.read(join(dir, "locales", "en.xml"), "en")).resource;
    const stub = makeStubProvider();
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      {
        provider: stub.provider,
        adapter: androidXml,
        format: "android-xml",
        targetLocale: "pl",
        resolver: createLocalePathResolver(dir, {
          sourceLocale: "en",
          targetLocales: ["pl"],
          format: "android-xml",
          files: { pattern: "locales/{locale}.xml" },
        }),
      },
    );

    const { summary, lockEntries } = await runLocale(params);

    expect(summary.translated).toEqual(["hello"]);
    expect(summary.orphaned).toEqual(["count[few]"]);
    expect(summary.pruned).toEqual([]);
    expect(lockEntries["count[few]"]).toBeUndefined();
    const written = await readTextFile(join(dir, "locales", "pl.xml"));
    expect(written).toContain('quantity="few"');
    const rewritten = await androidXml.read(join(dir, "locales", "pl.xml"), "pl");
    expect(rewritten.resource.entries.get("count[few]")?.value).toBe("kilka utworow");
  });
});

describe("runLocale: plural generation", () => {
  it("synthesizes the missing CLDR plural forms a richer target needs and locks them", async () => {
    const { dir, sourceResource } = await setup({
      items_one: "{{count}} item",
      items_other: "{{count}} items",
    });
    const stub = makeStubProvider();
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      { provider: stub.provider, targetLocale: "pl", generatePlurals: true },
    );

    const { summary, lockEntries } = await runLocale(params);

    expect(summary.generated).toEqual(["items_few", "items_many"]);
    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_few).toBeDefined();
    expect(pl.items_many).toBeDefined();
    expect(lockEntries.items_few).toBeDefined();
    expect(lockEntries.items_many).toBeDefined();
  });

  it("keeps an orphaned generated-plural-shaped target key out of orphaned and pruned", async () => {
    const { dir, sourceResource } = await setup({
      items_one: "{{count}} item",
      items_other: "{{count}} items",
    });
    await writeJsonFile(targetPath(dir, "pl"), { items_few: "x", orphan: "y" });
    const stub = makeStubProvider();
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      { provider: stub.provider, targetLocale: "pl", generatePlurals: true },
    );

    const { summary, lockEntries } = await runLocale(params);

    expect(summary.orphaned).toEqual(["orphan"]);
    expect(summary.pruned).toEqual([]);
    expect(lockEntries.orphan).toBeUndefined();
    const pl = (await readJsonFile(targetPath(dir, "pl"))) as Record<string, string>;
    expect(pl.items_few).toBe("x");
    expect(lockEntries.items_few).toBeUndefined();
  });

  it("carries the prior baseline lock hash for a previously generated plural key not regenerated", async () => {
    const { dir, sourceResource } = await setup({
      items_one: "{{count}} item",
      items_other: "{{count}} items",
    });
    const stub = makeStubProvider();
    const firstParams = makeParams(
      { source: sourceResource, cwd: dir },
      { provider: stub.provider, targetLocale: "pl", generatePlurals: true },
    );
    const first = await runLocale(firstParams);
    expect(first.summary.generated).toEqual(["items_few", "items_many"]);

    const baseline = new Map(Object.entries(first.lockEntries));
    const secondParams = makeParams(
      { source: sourceResource, cwd: dir },
      { provider: stub.provider, targetLocale: "pl", generatePlurals: true, baseline },
    );
    const second = await runLocale(secondParams);

    expect(second.summary.generated).toEqual([]);
    expect(second.lockEntries.items_few).toBe(first.lockEntries.items_few);
    expect(second.lockEntries.items_many).toBe(first.lockEntries.items_many);
  });

  it("carries the prior baseline lock hash for a generated plural key when generation is off", async () => {
    const { dir, sourceResource } = await setup({
      items_one: "{{count}} item",
      items_other: "{{count}} items",
    });
    await writeJsonFile(targetPath(dir, "pl"), {
      items_one: "{{count}} przedmiot",
      items_other: "{{count}} przedmiotow",
      items_few: "{{count}} przedmioty",
      items_many: "{{count}} przedmiotow",
    });
    const stub = makeStubProvider();
    const baseline = new Map([
      ["items_few", "generated-few-hash"],
      ["items_many", "generated-many-hash"],
    ]);
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      { provider: stub.provider, targetLocale: "pl", generatePlurals: false, baseline },
    );

    const { lockEntries } = await runLocale(params);

    expect(lockEntries.items_few).toBe("generated-few-hash");
    expect(lockEntries.items_many).toBe("generated-many-hash");
  });

  it("drops the baseline hash of a source-less key the user deleted from the target file", async () => {
    const { dir, sourceResource } = await setup({ a: "A" }, { a: "da" });
    const stub = makeStubProvider();
    const baseline = new Map([["deleted_few", "generated-few-hash"]]);
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      { provider: stub.provider, baseline },
    );

    const { lockEntries } = await runLocale(params);

    expect(lockEntries.deleted_few).toBeUndefined();
  });

  it("re-emits the incomplete warning when generation cannot complete the plural set", async () => {
    const { dir, sourceResource } = await setup({
      items_one: "{{count}} item",
      items_other: "{{count}} items",
    });
    const stub = makeStubProvider({ failIntegrity: new Set(["items_many"]) });
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      { provider: stub.provider, targetLocale: "pl", generatePlurals: true },
    );

    const { summary } = await runLocale(params);

    expect(summary.generated).toEqual(["items_few"]);
    expect(summary.integrityMismatches).toContain("items_many");
    expect(summary.notices.map((n) => n.code)).toContain("PLURAL_CATEGORIES_INCOMPLETE");
  });

  it("emits no plural warning for a non-i18next format when generation is on", async () => {
    const { dir, sourceResource } = await setup({
      items_one: "{{count}} item",
      items_other: "{{count}} items",
    });
    const stub = makeStubProvider();
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      { provider: stub.provider, format: "vue-i18n-json", generatePlurals: true },
    );

    const { summary } = await runLocale(params);

    expect(summary.notices.map((n) => n.code)).not.toContain("PLURAL_CATEGORIES_INCOMPLETE");
  });
});

describe("runLocale: ICU branch-aware comparePlaceholders wiring (real ai-providers call site)", () => {
  const nextIntl = createNextIntlJsonAdapter();

  it("flags a placeholder invented in a single target branch as an integrity mismatch, not accepted", async () => {
    const { dir, sourceResource } = await setupWithAdapter(nextIntl, {
      items: "{count, plural, one {# item} other {# items}}",
    });
    const provider = anthropicStubProvider([
      { key: "items", value: "{count, plural, one {# item} other {# items by {author}}}" },
    ]);
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      { provider, adapter: nextIntl, format: "next-intl-json" },
    );

    const { summary, lockEntries } = await runLocale(params);

    expect(summary.translated).toEqual([]);
    expect(summary.integrityMismatches).toEqual(["items"]);
    expect(lockEntries.items).toBeUndefined();
  });

  it("still flags a placeholder dropped from a single target branch as an integrity mismatch", async () => {
    const { dir, sourceResource } = await setupWithAdapter(nextIntl, {
      items: "{count, plural, one {# by {author}} other {# by {author}}}",
    });
    const provider = anthropicStubProvider([
      { key: "items", value: "{count, plural, one {# by {author}} other {#}}" },
    ]);
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      { provider, adapter: nextIntl, format: "next-intl-json" },
    );

    const { summary } = await runLocale(params);

    expect(summary.integrityMismatches).toEqual(["items"]);
  });

  it("accepts a correct translation that keeps a source-only-partial placeholder in its matching branch", async () => {
    const { dir, sourceResource } = await setupWithAdapter(nextIntl, {
      msg: "{count, plural, one {One msg from {sender}} other {# messages}}",
    });
    const provider = anthropicStubProvider([
      {
        key: "msg",
        value: "{count, plural, one {Eine Nachricht von {sender}} other {# Nachrichten}}",
      },
    ]);
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      { provider, adapter: nextIntl, format: "next-intl-json" },
    );

    const { summary, lockEntries } = await runLocale(params);

    expect(summary.translated).toEqual(["msg"]);
    expect(summary.integrityMismatches).toEqual([]);
    expect(lockEntries.msg).toBeDefined();
    const de = (await readJsonFile(join(dir, "locales", "de.json"))) as Record<string, string>;
    expect(de.msg).toBe("{count, plural, one {Eine Nachricht von {sender}} other {# Nachrichten}}");
  });
});

describe("runLocale: gateCandidateValue's validateMessage delta", () => {
  const nextIntl = createNextIntlJsonAdapter();

  it("withholds a candidate that passes placeholder comparison but fails ICU syntax validation", async () => {
    const { dir, sourceResource } = await setupWithAdapter(nextIntl, { greeting: "Hello world" });
    const provider = anthropicStubProvider([{ key: "greeting", value: "Hallo {name" }]);
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      { provider, adapter: nextIntl, format: "next-intl-json" },
    );

    const { summary, lockEntries } = await runLocale(params);

    expect(summary.translated).toEqual([]);
    expect(summary.integrityMismatches).toEqual(["greeting"]);
    expect(lockEntries.greeting).toBeUndefined();
  });

  it("keeps the placeholder dimension unchanged: a well-formed ICU candidate is still accepted or withheld purely on its placeholders", async () => {
    const { dir, sourceResource } = await setupWithAdapter(nextIntl, {
      dropped: "{count, plural, one {# by {author}} other {# by {author}}}",
      matching: "{count, plural, one {One} other {# items}}",
    });
    const provider = anthropicStubProvider([
      { key: "dropped", value: "{count, plural, one {# by {author}} other {#}}" },
      { key: "matching", value: "{count, plural, one {Eins} other {# Elemente}}" },
    ]);
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      { provider, adapter: nextIntl, format: "next-intl-json" },
    );

    const { summary } = await runLocale(params);

    expect(summary.integrityMismatches).toEqual(["dropped"]);
    expect(summary.translated).toEqual(["matching"]);
  });

  it("keeps the non-ICU placeholder dimension unchanged: validateMessage is unconditionally true and never withholds", async () => {
    const { dir, sourceResource } = await setup({ a: "Hello {{name}}" });
    const stub = makeStubProvider({ failIntegrity: new Set(["a"]) });
    const params = makeParams({ source: sourceResource, cwd: dir }, { provider: stub.provider });

    const { summary } = await runLocale(params);

    expect(summary.integrityMismatches).toEqual(["a"]);
  });
});

describe("runLocale: needsReview (real ai-providers reviewFlags call site)", () => {
  it("folds reviewFlags into needsReview, sorted by key", async () => {
    const { dir, sourceResource } = await setup({ b: "Hello there", a: "Good day" });
    const provider = anthropicStubProvider([
      { key: "b", value: "Hello there" },
      { key: "a", value: "Good day" },
    ]);
    const params = makeParams({ source: sourceResource, cwd: dir }, { provider });

    const { summary } = await runLocale(params);

    expect([...summary.translated].sort()).toEqual(["a", "b"]);
    expect(summary.needsReview).toEqual([
      { key: "a", reasons: ["EQUALS_SOURCE"] },
      { key: "b", reasons: ["EQUALS_SOURCE"] },
    ]);
  });

  it("never reports a key withheld by the integrity check, even if it also carried a review flag", async () => {
    const { dir, sourceResource } = await setup({
      long: "This is a fairly long source with {{ph}} inside",
    });
    const provider = anthropicStubProvider([{ key: "long", value: "hi" }]);
    const params = makeParams({ source: sourceResource, cwd: dir }, { provider });

    const { summary } = await runLocale(params);

    expect(summary.integrityMismatches).toEqual(["long"]);
    expect(summary.translated).toEqual([]);
    expect(summary.needsReview).toEqual([]);
  });

  it("reports an empty needsReview when the provider flags nothing", async () => {
    const { dir, sourceResource } = await setup({ a: "Hi there" });
    const provider = anthropicStubProvider([{ key: "a", value: "Hallo dort" }]);
    const params = makeParams({ source: sourceResource, cwd: dir }, { provider });

    const { summary } = await runLocale(params);

    expect(summary.translated).toEqual(["a"]);
    expect(summary.needsReview).toEqual([]);
  });

  it("merges reviewFlags across multiple sub-batches, each with its own TranslateResult", async () => {
    const { dir, sourceResource } = await setup({ b: "Hello there", a: "Good day" });
    const provider: TranslationProvider = {
      id: "stub",
      kind: "llm",
      supportsGlossary: false,
      translateBatch: async (request) => {
        const values = new Map<string, string>();
        const integrity = new Map<string, PlaceholderIntegrityResult>();
        const reviewFlags = new Map<
          string,
          { status: "review"; reasons: readonly ["EQUALS_SOURCE"] }
        >();
        for (const entry of request.entries) {
          values.set(entry.key, entry.value);
          integrity.set(entry.key, { matches: true, missing: [], extra: [], reordered: false });
          reviewFlags.set(entry.key, { status: "review", reasons: ["EQUALS_SOURCE"] });
        }
        return { values, integrity, reviewFlags };
      },
    };
    const params = makeParams({ source: sourceResource, cwd: dir }, { provider, maxBatchSize: 1 });

    const { summary } = await runLocale(params);

    expect(summary.needsReview).toEqual([
      { key: "a", reasons: ["EQUALS_SOURCE"] },
      { key: "b", reasons: ["EQUALS_SOURCE"] },
    ]);
  });
});

describe("runLocale: lock entries for prototype-shaped keys", () => {
  it("records a lock entry for a top-level key named __proto__", async () => {
    const { dir, sourceResource } = await setup(
      Object.fromEntries([
        ["__proto__", "A"],
        ["b", "B"],
      ]),
    );
    const stub = makeStubProvider();
    const params = makeParams({ source: sourceResource, cwd: dir }, { provider: stub.provider });

    const { summary, lockEntries } = await runLocale(params);

    expect(summary.translated).toContain("__proto__");
    expect(Object.keys(lockEntries).sort()).toEqual(["__proto__", "b"]);
    expect(Object.getPrototypeOf(lockEntries)).toBe(Object.prototype);
  });

  it("carries a __proto__ baseline forward for a source-less target key", async () => {
    const { dir, sourceResource } = await setup({ a: "A" }, { a: "da" });
    await writeJsonFile(
      targetPath(dir, "de"),
      Object.fromEntries([
        ["a", "da"],
        ["__proto__", "kept"],
      ]),
    );
    const stub = makeStubProvider();
    const params = makeParams(
      { source: sourceResource, cwd: dir },
      { provider: stub.provider, baseline: new Map([["__proto__", "prior-hash"]]) },
    );

    const { lockEntries } = await runLocale(params);

    expect(Object.keys(lockEntries).sort()).toEqual(["__proto__", "a"]);
  });
});
