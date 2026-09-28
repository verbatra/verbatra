import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { LOCALE_STYLES } from "../locale-path/style.js";
import { baseConfig } from "../test-support.js";
import { type VerbatraConfig, verbatraConfigSchema } from "./schema.js";

function issuesFor(config: VerbatraConfig): readonly { path: string; message: string }[] {
  const result = verbatraConfigSchema.safeParse(config);
  return result.success
    ? []
    : result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

const EXOTIC_VALID = [
  "sr-Latn",
  "zh-Hant-TW",
  "yue",
  "fil",
  "haw",
  "ckb",
  "es-419",
  "pt-BR",
  "de-DE-1996",
  "en-US-u-ca-gregory",
  "en-a-bbb-x-a-ccc",
  "qps-Ploc",
];

const DEPRECATED = ["iw", "in", "tl"];

const NON_CANONICAL = ["zh-hant-tw", "en-us", "EN", "sh"];

describe("verbatraConfigSchema: valid BCP 47 locale codes", () => {
  it.each(EXOTIC_VALID)("accepts %s as a target locale", (locale) => {
    expect(issuesFor(baseConfig({ targetLocales: [locale] }))).toEqual([]);
  });

  it.each(EXOTIC_VALID)("accepts %s as the source locale", (locale) => {
    expect(issuesFor(baseConfig({ sourceLocale: locale, targetLocales: ["de"] }))).toEqual([]);
  });

  it.each([...DEPRECATED, ...NON_CANONICAL])(
    "accepts the valid but non-canonical %s as written, leaving the warning to doctor",
    (locale) => {
      const result = verbatraConfigSchema.safeParse(
        baseConfig({ sourceLocale: "fr", targetLocales: [locale] }),
      );
      expect(result.success).toBe(true);
      expect(result.data?.targetLocales).toEqual([locale]);
    },
  );
});

describe("verbatraConfigSchema: invalid locale codes", () => {
  it.each([
    "x",
    "pt-br-x",
    "english",
    "german",
    "abcd",
    "en-",
    "-en",
    "en--US",
    "de-1996-1996",
    "en-a-bb-a-cc",
  ])("rejects %s with one message naming the field and the code", (locale) => {
    const issues = issuesFor(baseConfig({ targetLocales: ["de", locale] }));
    expect(issues).toEqual([
      { path: "targetLocales.1", message: `"${locale}" is not a valid BCP 47 locale code` },
    ]);
  });

  it.each([
    ["en_US", "en-US"],
    ["pt_BR", "pt-BR"],
    ["pt_br", "pt-br"],
    ["zh_hant_tw", "zh-hant-tw"],
    ["es_419", "es-419"],
  ])(
    "rejects the underscore spelling %s with a hint towards %s and the posix style",
    (locale, hyphenated) => {
      expect(issuesFor(baseConfig({ targetLocales: [locale] }))).toEqual([
        {
          path: "targetLocales.0",
          message: `"${locale}" is not a valid BCP 47 locale code; write "${hyphenated}" and set files.localeStyle to "posix" to keep underscores in file names`,
        },
      ]);
    },
  );

  it.each([
    ["sr@latin", "sr-Latn"],
    ["sr_RS@latin", "sr-Latn-RS"],
    ["uz@cyrillic", "uz-Cyrl"],
  ])(
    "rejects the gettext spelling %s with a hint towards %s and the posix style",
    (locale, hyphenated) => {
      expect(issuesFor(baseConfig({ targetLocales: [locale] }))).toEqual([
        {
          path: "targetLocales.0",
          message: `"${locale}" is not a valid BCP 47 locale code; write "${hyphenated}" and set files.localeStyle to "posix" to keep "${locale}" in the file names of a gettext-po layout`,
        },
      ]);
    },
  );

  it.each(["x_y", "german_DE", "de_1996_1996", "german@latin", "sr@klingon"])(
    "gives no hint for %s, whose hyphenated form would still fail the schema",
    (locale) => {
      expect(issuesFor(baseConfig({ targetLocales: [locale] }))).toEqual([
        { path: "targetLocales.0", message: `"${locale}" is not a valid BCP 47 locale code` },
      ]);
    },
  );

  it("rejects an invalid source locale under its own field", () => {
    expect(issuesFor(baseConfig({ sourceLocale: "x" }))).toEqual([
      { path: "sourceLocale", message: '"x" is not a valid BCP 47 locale code' },
    ]);
  });

  it("rejects an empty locale code with a single message", () => {
    expect(issuesFor(baseConfig({ sourceLocale: "" }))).toEqual([
      { path: "sourceLocale", message: "a locale code must not be empty" },
    ]);
  });

  it("rejects the underscore spelling under every locale style", () => {
    for (const localeStyle of LOCALE_STYLES) {
      const config = baseConfig({
        targetLocales: ["en_US"],
        files: { pattern: "locales/{locale}.json", localeStyle },
      });
      expect(issuesFor(config).map((issue) => issue.path)).toEqual(["targetLocales.0"]);
    }
  });
});

const OBJECT_KEY_HAZARDS = [
  ...new Set([
    ...Object.getOwnPropertyNames(Object.prototype),
    "__proto__",
    "prototype",
    "tostring",
    "VALUEOF",
  ]),
];

describe("verbatraConfigSchema: locale codes unsafe as object keys", () => {
  it.each(
    LOCALE_STYLES.flatMap((localeStyle) =>
      OBJECT_KEY_HAZARDS.map((locale) => ({ localeStyle, locale })),
    ),
  )(
    "rejects $locale as a target locale under the $localeStyle style",
    ({ localeStyle, locale }) => {
      const issues = issuesFor(
        baseConfig({
          targetLocales: ["de", locale],
          files: { pattern: "locales/{locale}.json", localeStyle },
        }),
      );
      expect(issues.map((issue) => issue.path)).toEqual(["targetLocales.1"]);
    },
  );

  it.each(OBJECT_KEY_HAZARDS)("rejects %s as the source locale", (locale) => {
    const issues = issuesFor(baseConfig({ sourceLocale: locale }));
    expect(issues.map((issue) => issue.path)).toEqual(["sourceLocale"]);
  });

  it("rejects toString and valueOf even though Intl accepts them as language subtags", () => {
    expect(Intl.getCanonicalLocales(["toString", "valueOf"])).toEqual(["tostring", "valueof"]);
    expect(issuesFor(baseConfig({ targetLocales: ["toString", "valueOf"] }))).toEqual([
      { path: "targetLocales.0", message: '"toString" is not a valid BCP 47 locale code' },
      { path: "targetLocales.1", message: '"valueOf" is not a valid BCP 47 locale code' },
    ]);
  });
});

function hintedCode(locale: string): string {
  const [issue] = issuesFor(baseConfig({ targetLocales: [locale] }));
  const hinted = /write "([^"]+)" and set files\.localeStyle to "posix"/.exec(issue?.message ?? "");
  if (hinted?.[1] === undefined) {
    throw new Error(`no hint for ${locale}`);
  }
  return hinted[1];
}

function relativePath(config: VerbatraConfig, locale: string): string {
  const cwd = resolve("/projects/app");
  return relative(cwd, createLocalePathResolver(cwd, config).pathFor(locale)).replaceAll("\\", "/");
}

describe("verbatraConfigSchema: the gettext modifier hint keeps every file where it was", () => {
  it.each(["sr@latin", "sr_RS@latin", "uz@cyrillic", "ks_IN@devanagari"])(
    "the hint for %s resolves under the posix style to the path the old code resolved to",
    (locale) => {
      const pattern = "locale/{locale}/LC_MESSAGES/messages.po";
      const hinted = hintedCode(locale);
      const migrated = baseConfig({
        format: "gettext-po",
        targetLocales: [hinted],
        files: { pattern, localeStyle: "posix" },
      });

      expect(issuesFor(migrated)).toEqual([]);
      expect(relativePath(migrated, hinted)).toBe(`locale/${locale}/LC_MESSAGES/messages.po`);
    },
  );
});

describe("verbatraConfigSchema: the underscore hint keeps every file where it was", () => {
  it.each(["pt_BR", "pt_br", "zh_Hant_TW", "es_419", "sr_Latn"])(
    "the hint for %s resolves under the posix style to the path the old code resolved to",
    (locale) => {
      const pattern = "locales/{locale}/messages.json";
      const hinted = hintedCode(locale);
      const migrated = baseConfig({
        targetLocales: [hinted],
        files: { pattern, localeStyle: "posix" },
      });
      const previous = baseConfig({ targetLocales: [locale], files: { pattern } });

      expect(issuesFor(migrated)).toEqual([]);
      expect(relativePath(migrated, hinted)).toBe(relativePath(previous, locale));
      expect(relativePath(migrated, hinted)).toBe(`locales/${locale}/messages.json`);
    },
  );
});
