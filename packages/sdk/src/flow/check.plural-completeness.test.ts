import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { SupportedFormat } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { baseConfig, makeTempDir } from "../test-support.js";
import { check } from "./check.js";
import type { IncompletePlural } from "./plural-completeness.js";

const TARGETS = ["pl", "ar"] as const;

const EXPECTED_MISSING: Readonly<Record<(typeof TARGETS)[number], readonly string[]>> = {
  pl: ["few", "many"],
  ar: ["zero", "two", "few", "many"],
};

interface CompletenessFixture {
  readonly format: SupportedFormat;
  readonly pattern: string;
  readonly localeStyle?: "android";
  readonly key: string;
  readonly argument?: string;
  readonly write: (dir: string, config: VerbatraConfig) => Promise<void>;
}

function pathFor(dir: string, config: VerbatraConfig, locale: string): string {
  return createLocalePathResolver(dir, config).pathFor(locale);
}

async function writeAt(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function writeEveryLocale(
  dir: string,
  config: VerbatraConfig,
  render: (locale: string) => string,
): Promise<void> {
  for (const locale of ["en", ...TARGETS]) {
    await writeAt(pathFor(dir, config, locale), render(locale));
  }
}

function androidXml(locale: string): string {
  return (
    '<?xml version="1.0" encoding="utf-8"?>\n<resources>' +
    `<string name="title">${locale}</string>` +
    `<plurals name="files"><item quantity="one">%d ${locale}</item>` +
    `<item quantity="other">%d ${locale}s</item></plurals></resources>\n`
  );
}

function stringsdict(locale: string): string {
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    '<plist version="1.0"><dict><key>files</key><dict>' +
    "<key>NSStringLocalizedFormatKey</key><string>%#@v@</string>" +
    "<key>v</key><dict><key>NSStringFormatSpecTypeKey</key><string>NSStringPluralRuleType</string>" +
    "<key>NSStringFormatValueTypeKey</key><string>d</string>" +
    `<key>one</key><string>%d ${locale}</string><key>other</key><string>%d ${locale}s</string>` +
    "</dict></dict></dict></plist>"
  );
}

function xcstringsPlural(locale: string): unknown {
  return {
    variations: {
      plural: {
        one: { stringUnit: { state: "translated", value: `%d ${locale}` } },
        other: { stringUnit: { state: "translated", value: `%d ${locale}s` } },
      },
    },
  };
}

function xcstringsCatalogue(): string {
  const localizations = Object.fromEntries(
    ["en", ...TARGETS].map((locale) => [locale, xcstringsPlural(locale)]),
  );
  return JSON.stringify({
    sourceLanguage: "en",
    version: "1.0",
    strings: { files: { localizations } },
  });
}

function icuMessage(locale: string): string {
  return `{count, plural, one {# ${locale}} other {# ${locale}s}}`;
}

const FIXTURES: readonly CompletenessFixture[] = [
  {
    format: "i18next-json",
    pattern: "locales/{locale}.json",
    key: "files",
    write: (dir, config) =>
      writeEveryLocale(dir, config, (locale) =>
        JSON.stringify({ title: locale, files_one: `{{count}} ${locale}`, files_other: locale }),
      ),
  },
  {
    format: "android-xml",
    pattern: "res/{locale}/strings.xml",
    localeStyle: "android",
    key: "files",
    write: (dir, config) => writeEveryLocale(dir, config, androidXml),
  },
  {
    format: "apple-strings",
    pattern: "locales/{locale}.strings",
    key: "files",
    write: async (dir, config) => {
      for (const locale of ["en", ...TARGETS]) {
        const stringsPath = pathFor(dir, config, locale);
        await writeAt(stringsPath, `"title" = "${locale}";\n`);
        await writeAt(stringsPath.replace(/\.strings$/, ".stringsdict"), stringsdict(locale));
      }
    },
  },
  {
    format: "apple-xcstrings",
    pattern: "{locale}Localizable.xcstrings",
    key: "files",
    write: (dir) => writeAt(join(dir, "Localizable.xcstrings"), xcstringsCatalogue()),
  },
  {
    format: "next-intl-json",
    pattern: "messages/{locale}.json",
    key: "files",
    argument: "count",
    write: (dir, config) =>
      writeEveryLocale(dir, config, (locale) =>
        JSON.stringify({ title: locale, files: icuMessage(locale) }),
      ),
  },
  {
    format: "arb",
    pattern: "l10n/app_{locale}.arb",
    key: "files",
    argument: "count",
    write: (dir, config) =>
      writeEveryLocale(dir, config, (locale) =>
        JSON.stringify({ "@@locale": locale, title: locale, files: icuMessage(locale) }),
      ),
  },
];

function configFor(
  format: SupportedFormat,
  pattern: string,
  targetLocales: readonly string[],
  localeStyle?: "android",
): VerbatraConfig {
  return baseConfig({
    format,
    targetLocales: [...targetLocales],
    files: { pattern, ...(localeStyle !== undefined ? { localeStyle } : {}) },
  });
}

function expectedGap(
  fixture: CompletenessFixture,
  locale: (typeof TARGETS)[number],
): IncompletePlural {
  return {
    code: "PLURAL_CATEGORIES_INCOMPLETE",
    key: fixture.key,
    ...(fixture.argument !== undefined ? { argument: fixture.argument } : {}),
    ruleType: "cardinal",
    missing: EXPECTED_MISSING[locale] as IncompletePlural["missing"],
  };
}

describe("check reports plural categories a target language needs but lacks", () => {
  it.each(FIXTURES.map((fixture) => [fixture.format, fixture] as const))(
    "%s: flags the categories Polish and Arabic need beyond one and other",
    async (_format, fixture) => {
      const config = configFor(fixture.format, fixture.pattern, TARGETS, fixture.localeStyle);
      const dir = await makeTempDir();
      await fixture.write(dir, config);

      const summary = await check({ config, cwd: dir });

      expect(summary.inSync).toBe(true);
      expect(summary.locales.map((locale) => locale.incompletePlurals)).toEqual([
        [expectedGap(fixture, "pl")],
        [expectedGap(fixture, "ar")],
      ]);
    },
  );
});

async function nextIntlProject(
  targetLocale: string,
  source: Record<string, string>,
  target: Record<string, string> | undefined,
): Promise<{ readonly dir: string; readonly config: VerbatraConfig }> {
  const config = configFor("next-intl-json", "messages/{locale}.json", [targetLocale]);
  const dir = await makeTempDir();
  await writeAt(pathFor(dir, config, "en"), JSON.stringify(source));
  if (target !== undefined) {
    await writeAt(pathFor(dir, config, targetLocale), JSON.stringify(target));
  }
  return { dir, config };
}

async function gapsFor(
  targetLocale: string,
  source: Record<string, string>,
  target: Record<string, string> | undefined,
): Promise<readonly IncompletePlural[] | undefined> {
  const { dir, config } = await nextIntlProject(targetLocale, source, target);
  const summary = await check({ config, cwd: dir });
  return summary.locales[0]?.incompletePlurals;
}

const EN_PLURAL = { files: "{count, plural, one {# file} other {# files}}" };

describe("which plural categories count as missing", () => {
  it("reports nothing when every category the language uses is present", async () => {
    const complete = "{count, plural, one {#} few {#} many {#} other {#}}";
    expect(await gapsFor("pl", EN_PLURAL, { files: complete })).toEqual([]);
  });

  it("leaves a plural the target lacks entirely to the missing-key count", async () => {
    const { dir, config } = await nextIntlProject("pl", EN_PLURAL, undefined);
    const summary = await check({ config, cwd: dir });
    expect(summary.locales[0]).toMatchObject({ missing: 1, incompletePlurals: [] });
  });

  it("does not let an exact-value arm stand in for a category", async () => {
    const target = { files: "{count, plural, =1 {#} few {#} many {#} other {#}}" };
    expect(await gapsFor("pl", EN_PLURAL, target)).toEqual([
      {
        code: "PLURAL_CATEGORIES_INCOMPLETE",
        key: "files",
        argument: "count",
        ruleType: "cardinal",
        missing: ["one"],
      },
    ]);
  });

  it("requires other even when every other category is present", async () => {
    const config = configFor("i18next-json", "locales/{locale}.json", ["pl"]);
    const dir = await makeTempDir();
    await writeAt(pathFor(dir, config, "en"), JSON.stringify({ n_one: "1", n_other: "n" }));
    await writeAt(
      pathFor(dir, config, "pl"),
      JSON.stringify({ n_one: "1", n_few: "f", n_many: "m" }),
    );

    const summary = await check({ config, cwd: dir });

    expect(summary.locales[0]?.incompletePlurals?.[0]?.missing).toEqual(["other"]);
  });

  it("does not report a category the language does not use", async () => {
    const target = {
      files: "{count, plural, zero {#} one {#} two {#} few {#} many {#} other {#}}",
    };
    expect(await gapsFor("pl", EN_PLURAL, target)).toEqual([]);
  });

  it("does not subject a select to plural categories", async () => {
    const source = { who: "{gender, select, female {she} other {they}}" };
    expect(await gapsFor("pl", source, { who: "{gender, select, other {oni}}" })).toEqual([]);
  });

  it("checks a selectordinal against the ordinal rules", async () => {
    const source = { place: "{n, selectordinal, one {#st} two {#nd} few {#rd} other {#th}}" };
    const target = { place: "{n, selectordinal, one {#st} other {#th}}" };
    expect(await gapsFor("en-GB", source, target)).toEqual([
      {
        code: "PLURAL_CATEGORIES_INCOMPLETE",
        key: "place",
        argument: "n",
        ruleType: "ordinal",
        missing: ["two", "few"],
      },
    ]);
  });

  it("checks every nested plural on its own", async () => {
    const nested = (female: string, other: string): string =>
      `{g, select, female {{count, plural, ${female}}} other {{count, plural, ${other}}}}`;
    const source = { msg: nested("one {#} other {#}", "one {#} other {#}") };
    const target = {
      msg: nested("one {#} few {#} many {#} other {#}", "one {#} many {#} other {#}"),
    };
    expect((await gapsFor("pl", source, target))?.[0]?.missing).toEqual(["few"]);
  });

  it("requires only other for a language the runtime has no plural rules for", async () => {
    const target = { files: "{count, plural, other {#}}" };
    expect(await gapsFor("tlh", EN_PLURAL, target)).toEqual([]);
  });

  it("ignores a plural only the target defines", async () => {
    const target = { files: "{count, plural, other {#}}", extra: "{n, plural, other {#}}" };
    expect((await gapsFor("pl", EN_PLURAL, target))?.map((gap) => gap.key)).toEqual(["files"]);
  });

  it("skips a target value that is not valid ICU", async () => {
    expect(await gapsFor("pl", EN_PLURAL, { files: "{count, plural, one {#}" })).toEqual([]);
  });

  it("orders the report by key and then by argument", async () => {
    const source = {
      b: "{n, plural, one {#} other {#}}",
      a: "{y, plural, one {#} other {#}} {x, plural, one {#} other {#}}",
    };
    const target = {
      b: "{n, plural, other {#}}",
      a: "{y, plural, other {#}} {x, plural, other {#}}",
    };
    const gaps = await gapsFor("pl", source, target);
    expect(gaps?.map((gap) => [gap.key, gap.argument])).toEqual([
      ["a", "x"],
      ["a", "y"],
      ["b", "n"],
    ]);
  });
});

describe("i18next ordinal plurals", () => {
  it("checks a _ordinal plural against the ordinal rules", async () => {
    const config = configFor("i18next-json", "locales/{locale}.json", ["en-GB"]);
    const dir = await makeTempDir();
    const forms = { place_ordinal_one: "#st", place_ordinal_other: "#th" };
    await writeAt(pathFor(dir, config, "en"), JSON.stringify(forms));
    await writeAt(pathFor(dir, config, "en-GB"), JSON.stringify(forms));

    const summary = await check({ config, cwd: dir });

    expect(summary.locales[0]?.incompletePlurals).toEqual([
      {
        code: "PLURAL_CATEGORIES_INCOMPLETE",
        key: "place_ordinal",
        ruleType: "ordinal",
        missing: ["two", "few"],
      },
    ]);
  });
});

describe("formats whose plural forms do not follow CLDR categories", () => {
  it("reports nothing for vue-i18n pipe plurals", async () => {
    const config = configFor("vue-i18n-json", "locales/{locale}.json", ["pl"]);
    const dir = await makeTempDir();
    await writeAt(pathFor(dir, config, "en"), JSON.stringify({ files: "one file | {n} files" }));
    await writeAt(pathFor(dir, config, "pl"), JSON.stringify({ files: "plik | {n} pliki" }));

    const summary = await check({ config, cwd: dir });

    expect(summary.locales[0]?.incompletePlurals).toEqual([]);
  });
});
