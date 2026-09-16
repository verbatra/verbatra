import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { InconsistencyGroup, SupportedFormat } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { VerbatraConfig } from "../config/schema.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { baseConfig, makeTempDir } from "../test-support.js";
import { check } from "./check.js";

interface PluralForms {
  readonly one: string;
  readonly other: string;
}

type PluralTable = Readonly<Record<string, PluralForms>>;

const EN: PluralTable = {
  selected: { one: "%d selected", other: "%d selected" },
  a: { one: "%d file", other: "%d files" },
  b: { one: "%d file", other: "%d files" },
};

const RU: PluralTable = {
  selected: { one: "Выбран %d", other: "Выбрано %d" },
  a: { one: "%d файл", other: "%d файлов" },
  b: { one: "%d документ", other: "%d файлов" },
};

interface PluralFixture {
  readonly format: SupportedFormat;
  readonly pattern: string;
  readonly localeStyle?: "android";
  readonly write: (dir: string, config: VerbatraConfig) => Promise<void>;
  readonly expected: InconsistencyGroup;
}

function pathFor(dir: string, config: VerbatraConfig, locale: string): string {
  return createLocalePathResolver(dir, config).pathFor(locale);
}

async function writeAt(path: string, content: string): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content, "utf8");
}

async function writePerLocale(
  dir: string,
  config: VerbatraConfig,
  render: (table: PluralTable) => string,
): Promise<void> {
  await writeAt(pathFor(dir, config, "en"), render(EN));
  await writeAt(pathFor(dir, config, "ru"), render(RU));
}

function i18nextJson(table: PluralTable): string {
  const flat = Object.entries(table).flatMap(([key, forms]) => [
    [`${key}_one`, forms.one],
    [`${key}_other`, forms.other],
  ]);
  return `${JSON.stringify(Object.fromEntries(flat), null, 2)}\n`;
}

function androidXml(table: PluralTable): string {
  const plurals = Object.entries(table).map(
    ([key, forms]) =>
      `<plurals name="${key}"><item quantity="one">${forms.one}</item>` +
      `<item quantity="other">${forms.other}</item></plurals>`,
  );
  return `<?xml version="1.0" encoding="utf-8"?>\n<resources>${plurals.join("")}</resources>\n`;
}

function gettextPo(table: PluralTable): string {
  const header =
    'msgid ""\nmsgstr ""\n"Content-Type: text/plain; charset=UTF-8\\n"\n' +
    '"Plural-Forms: nplurals=2; plural=(n != 1);\\n"\n';
  const units = Object.entries(table).map(
    ([key, forms]) =>
      `msgid "${key}"\nmsgid_plural "${EN[key]?.other}"\n` +
      `msgstr[0] "${forms.one}"\nmsgstr[1] "${forms.other}"\n`,
  );
  return [header, ...units].join("\n");
}

function stringsdict(table: PluralTable): string {
  const groups = Object.entries(table).map(
    ([key, forms]) =>
      `<key>${key}</key><dict><key>NSStringLocalizedFormatKey</key><string>%#@v@</string>` +
      "<key>v</key><dict><key>NSStringFormatSpecTypeKey</key><string>NSStringPluralRuleType</string>" +
      "<key>NSStringFormatValueTypeKey</key><string>d</string>" +
      `<key>one</key><string>${forms.one}</string><key>other</key><string>${forms.other}</string>` +
      "</dict></dict>",
  );
  return (
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n' +
    `<plist version="1.0"><dict>${groups.join("")}</dict></plist>`
  );
}

function xcstringsPlural(forms: PluralForms): unknown {
  return {
    variations: {
      plural: {
        one: { stringUnit: { state: "translated", value: forms.one } },
        other: { stringUnit: { state: "translated", value: forms.other } },
      },
    },
  };
}

function xcstringsCatalogue(): string {
  const strings = Object.fromEntries(
    Object.keys(EN).map((key) => [
      key,
      {
        localizations: {
          en: xcstringsPlural(EN[key] as PluralForms),
          ru: xcstringsPlural(RU[key] as PluralForms),
        },
      },
    ]),
  );
  return JSON.stringify({ sourceLanguage: "en", version: "1.0", strings });
}

function oneFormGroup(
  aKey: string,
  bKey: string,
  pluralForm: string,
  extra: Partial<InconsistencyGroup> = {},
): InconsistencyGroup {
  return {
    source: "%d file",
    ...extra,
    isPlural: true,
    pluralForm,
    translations: [
      { value: "%d документ", keys: [bKey] },
      { value: "%d файл", keys: [aKey] },
    ],
  };
}

const FIXTURES: readonly PluralFixture[] = [
  {
    format: "i18next-json",
    pattern: "locales/{locale}.json",
    write: (dir, config) => writePerLocale(dir, config, i18nextJson),
    expected: oneFormGroup("a_one", "b_one", "one"),
  },
  {
    format: "android-xml",
    pattern: "res/{locale}/strings.xml",
    localeStyle: "android",
    write: (dir, config) => writePerLocale(dir, config, androidXml),
    expected: oneFormGroup("a[one]", "b[one]", "one"),
  },
  {
    format: "gettext-po",
    pattern: "locales/{locale}.po",
    write: (dir, config) => writePerLocale(dir, config, gettextPo),
    expected: oneFormGroup("a[0]", "b[0]", "0", { meaning: "%d files" }),
  },
  {
    format: "apple-strings",
    pattern: "locales/{locale}.strings",
    write: async (dir, config) => {
      for (const [locale, table] of [
        ["en", EN],
        ["ru", RU],
      ] as const) {
        const stringsPath = pathFor(dir, config, locale);
        await writeAt(stringsPath, `"title" = "${locale}";\n`);
        await writeAt(stringsPath.replace(/\.strings$/, ".stringsdict"), stringsdict(table));
      }
    },
    expected: oneFormGroup("a_one", "b_one", "one"),
  },
  {
    format: "apple-xcstrings",
    pattern: "{locale}Localizable.xcstrings",
    write: (dir) => writeAt(join(dir, "Localizable.xcstrings"), xcstringsCatalogue()),
    expected: oneFormGroup("a_one", "b_one", "one"),
  },
];

describe("check with consistency compares plural forms per form", () => {
  it.each(FIXTURES.map((fixture) => [fixture.format, fixture] as const))(
    "%s: keeps one key's forms apart and still groups one form across keys",
    async (_format, fixture) => {
      const config = baseConfig({
        format: fixture.format,
        targetLocales: ["ru"],
        files: {
          pattern: fixture.pattern,
          ...(fixture.localeStyle !== undefined ? { localeStyle: fixture.localeStyle } : {}),
        },
      });
      const dir = await makeTempDir();
      await fixture.write(dir, config);

      const summary = await check({ config, cwd: dir, consistency: true });

      expect(summary.locales[0]?.missing).toBe(0);
      expect(summary.locales[0]?.inconsistencies).toEqual([fixture.expected]);
    },
  );
});
