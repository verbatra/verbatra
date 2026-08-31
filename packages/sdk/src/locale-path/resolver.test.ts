import { relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { SdkError } from "../errors.js";
import { createLocalePathResolver, type LocalePathResolverConfig } from "./resolver.js";
import type { LocaleStyle } from "./style.js";

const CWD = resolve("/projects/app");

function makeConfig(
  pattern: string,
  overrides: Partial<Omit<LocalePathResolverConfig, "files">> & {
    readonly localeStyle?: LocaleStyle;
  } = {},
): LocalePathResolverConfig {
  return {
    sourceLocale: overrides.sourceLocale ?? "en",
    targetLocales: overrides.targetLocales ?? ["de"],
    format: overrides.format ?? "i18next-json",
    files: {
      pattern,
      ...(overrides.localeStyle !== undefined ? { localeStyle: overrides.localeStyle } : {}),
    },
  };
}

function relativePathFor(
  config: LocalePathResolverConfig,
  locale: string,
  cwd: string = CWD,
): string {
  const absolute = createLocalePathResolver(cwd, config).pathFor(locale);
  return relative(cwd, absolute).replaceAll("\\", "/");
}

function expectSdkError(run: () => unknown, code: string): void {
  let thrown: unknown;
  try {
    run();
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(SdkError);
  expect(thrown).toMatchObject({ code });
}

describe("createLocalePathResolver, literal style", () => {
  const literalCases: ReadonlyArray<readonly [string, string, string, string]> = [
    ["flat file per locale", "locales/{locale}.json", "de", "locales/de.json"],
    ["flat file per locale", "locales/{locale}.json", "pt-BR", "locales/pt-BR.json"],
    ["flat file per locale", "locales/{locale}.json", "sr-Latn", "locales/sr-Latn.json"],
    ["nested namespace", "locales/{locale}/common.json", "de", "locales/de/common.json"],
    ["nested namespace", "locales/{locale}/common.json", "pt-BR", "locales/pt-BR/common.json"],
    [
      "Apple lproj",
      "Resources/{locale}.lproj/Localizable.strings",
      "zh-Hans",
      "Resources/zh-Hans.lproj/Localizable.strings",
    ],
    [
      "Apple lproj",
      "Resources/{locale}.lproj/Localizable.strings",
      "pt-BR",
      "Resources/pt-BR.lproj/Localizable.strings",
    ],
  ];

  it.each(literalCases)("%s: %s spells %s as %s", (_layout, pattern, locale, expected) => {
    const config = makeConfig(pattern, { targetLocales: [locale] });
    expect(relativePathFor(config, locale)).toBe(expected);
  });

  it("is the style applied when localeStyle is absent", () => {
    const implicit = createLocalePathResolver(CWD, makeConfig("locales/{locale}.json"));
    const explicit = createLocalePathResolver(
      CWD,
      makeConfig("locales/{locale}.json", { localeStyle: "literal" }),
    );
    expect(implicit.pathFor("de")).toBe(explicit.pathFor("de"));
  });

  it("expands the source locale the same way as a target", () => {
    const config = makeConfig("locales/{locale}.json");
    expect(relativePathFor(config, "en")).toBe("locales/en.json");
  });

  it("substitutes every occurrence of the token", () => {
    const config = makeConfig("locales/{locale}/{locale}.json");
    expect(relativePathFor(config, "de")).toBe("locales/de/de.json");
  });

  it("resolves the pattern against cwd, not the process directory", () => {
    const other = resolve("/elsewhere/project");
    const resolver = createLocalePathResolver(other, makeConfig("locales/{locale}.json"));
    expect(resolver.pathFor("de")).toBe(resolve(other, "locales/de.json"));
  });

  it("accepts a pattern that deliberately points outside cwd", () => {
    const config = makeConfig("../shared/locales/{locale}.json");
    const resolver = createLocalePathResolver(CWD, config);
    expect(resolver.pathFor("de")).toBe(resolve(CWD, "../shared/locales/de.json"));
  });

  it("keeps a dollar sequence in a locale literal rather than reading it as a substitution", () => {
    const config = makeConfig("locales/{locale}.json", { targetLocales: ["a$&b"] });
    expect(relativePathFor(config, "a$&b")).toBe("locales/a$&b.json");
  });
});

describe("createLocalePathResolver, posix style", () => {
  const posixCases: ReadonlyArray<readonly [string, string, string]> = [
    ["locale/{locale}/LC_MESSAGES/messages.po", "de", "locale/de/LC_MESSAGES/messages.po"],
    ["locale/{locale}/LC_MESSAGES/messages.po", "pt-BR", "locale/pt_BR/LC_MESSAGES/messages.po"],
    ["i18n/messages_{locale}.properties", "de", "i18n/messages_de.properties"],
    ["i18n/messages_{locale}.properties", "pt-BR", "i18n/messages_pt_BR.properties"],
    ["i18n/messages_{locale}.properties", "fil-PH", "i18n/messages_fil_PH.properties"],
  ];

  it.each(posixCases)("%s spells %s as %s", (pattern, locale, expected) => {
    const config = makeConfig(pattern, { targetLocales: [locale], localeStyle: "posix" });
    expect(relativePathFor(config, locale)).toBe(expected);
  });

  it("preserves the configured casing rather than normalizing it", () => {
    const config = makeConfig("i18n/messages_{locale}.properties", {
      targetLocales: ["pt-br"],
      localeStyle: "posix",
    });
    expect(relativePathFor(config, "pt-br")).toBe("i18n/messages_pt_br.properties");
  });

  const posixRefusals = ["zh-Hans", "sr-Latn", "sr-Latn-RS", "es-419", "de-1996", "en-POSIX"];

  it.each(posixRefusals)("refuses %s, which has no correct underscore form", (locale) => {
    const config = makeConfig("locale/{locale}/LC_MESSAGES/messages.po", {
      targetLocales: [locale],
      localeStyle: "posix",
    });
    expectSdkError(() => createLocalePathResolver(CWD, config), "LOCALE_LAYOUT_INVALID");
  });

  it("names the locale and the style in the refusal", () => {
    const config = makeConfig("locale/{locale}/LC_MESSAGES/messages.po", {
      targetLocales: ["zh-Hans"],
      localeStyle: "posix",
    });
    expect(() => createLocalePathResolver(CWD, config)).toThrow(/zh-Hans.*posix|posix.*zh-Hans/);
  });
});

describe("createLocalePathResolver, android style", () => {
  const ANDROID_PATTERN = "res/{locale}/strings.xml";

  const androidCases: ReadonlyArray<readonly [string, string]> = [
    ["de", "values-de"],
    ["pt-BR", "values-pt-rBR"],
    ["fil-PH", "values-fil-rPH"],
    ["zh-Hans", "values-b+zh+Hans"],
    ["sr-Latn", "values-b+sr+Latn"],
    ["de-1996", "values-b+de+1996"],
    ["es-419", "values-b+es+419"],
    ["car", "values-b+car"],
    ["sr-Latn-RS", "values-b+sr+Latn+RS"],
  ];

  it.each(androidCases)("spells the target %s as %s", (locale, segment) => {
    const config = makeConfig(ANDROID_PATTERN, {
      targetLocales: [locale],
      localeStyle: "android",
    });
    expect(relativePathFor(config, locale)).toBe(`res/${segment}/strings.xml`);
  });

  it("puts the source locale in the unqualified default resource directory", () => {
    const config = makeConfig(ANDROID_PATTERN, { localeStyle: "android" });
    expect(relativePathFor(config, "en")).toBe("res/values/strings.xml");
  });

  it("spells a script-bearing source locale as the default directory too", () => {
    const config = makeConfig(ANDROID_PATTERN, {
      sourceLocale: "zh-Hans",
      targetLocales: ["de"],
      localeStyle: "android",
    });
    expect(relativePathFor(config, "zh-Hans")).toBe("res/values/strings.xml");
  });

  it("accepts any input casing and emits the conventional one", () => {
    const config = makeConfig(ANDROID_PATTERN, {
      targetLocales: ["PT-BR", "SR-latn-rs"],
      localeStyle: "android",
    });
    expect(relativePathFor(config, "PT-BR")).toBe("res/values-pt-rBR/strings.xml");
    expect(relativePathFor(config, "SR-latn-rs")).toBe("res/values-b+sr+Latn+RS/strings.xml");
  });

  it("refuses a tag needing more than four bcp47 subtags", () => {
    const config = makeConfig(ANDROID_PATTERN, {
      targetLocales: ["sl-Latn-IT-rozaj-biske"],
      localeStyle: "android",
    });
    expectSdkError(() => createLocalePathResolver(CWD, config), "LOCALE_LAYOUT_INVALID");
  });

  it("refuses a bare region, which no qualifier form can express", () => {
    const config = makeConfig(ANDROID_PATTERN, {
      targetLocales: ["419"],
      localeStyle: "android",
    });
    expectSdkError(() => createLocalePathResolver(CWD, config), "LOCALE_LAYOUT_INVALID");
  });

  it("refuses a tag that is not a language-led bcp47 tag", () => {
    const config = makeConfig(ANDROID_PATTERN, {
      targetLocales: ["not_a_tag"],
      localeStyle: "android",
    });
    expectSdkError(() => createLocalePathResolver(CWD, config), "LOCALE_LAYOUT_INVALID");
  });

  it("refuses a tag whose trailing subtag fits no bcp47 position", () => {
    const config = makeConfig(ANDROID_PATTERN, {
      targetLocales: ["de-abcdefghij"],
      localeStyle: "android",
    });
    expectSdkError(() => createLocalePathResolver(CWD, config), "LOCALE_LAYOUT_INVALID");
  });

  it("refuses a pattern that embeds the token inside a segment", () => {
    const config = makeConfig("res/values-{locale}/strings.xml", {
      targetLocales: ["de"],
      localeStyle: "android",
    });
    expectSdkError(() => createLocalePathResolver(CWD, config), "LOCALE_LAYOUT_INVALID");
  });

  it("refuses a token embedded in a file name too", () => {
    const config = makeConfig("res/{locale}.xml", { localeStyle: "android" });
    expectSdkError(() => createLocalePathResolver(CWD, config), "LOCALE_LAYOUT_INVALID");
  });

  it("applies the whole-segment rule to a backslash-separated pattern", () => {
    const config = makeConfig("res\\values-{locale}\\strings.xml", { localeStyle: "android" });
    expectSdkError(() => createLocalePathResolver(CWD, config), "LOCALE_LAYOUT_INVALID");
  });

  it("accepts a backslash-separated pattern whose token stands alone", () => {
    const config = makeConfig("res\\{locale}\\strings.xml", { localeStyle: "android" });
    expect(() => createLocalePathResolver(CWD, config)).not.toThrow();
  });

  it("allows an embedded token under a non-segment style", () => {
    const config = makeConfig("i18n/messages_{locale}.properties", { localeStyle: "posix" });
    expect(() => createLocalePathResolver(CWD, config)).not.toThrow();
  });
});

describe("createLocalePathResolver, hostile locales", () => {
  const traversalLocales = [
    "..",
    ".",
    "../..",
    "../../etc/passwd",
    "..\\..\\windows",
    "de/../../secrets",
    "",
  ];

  it.each(traversalLocales)(
    "refuses the locale %s rather than letting it steer the path",
    (locale) => {
      const config = makeConfig("locales/{locale}.json", { targetLocales: [locale] });
      expectSdkError(() => createLocalePathResolver(CWD, config), "LOCALE_LAYOUT_INVALID");
    },
  );

  it("refuses a locale carrying a null byte", () => {
    const config = makeConfig("locales/{locale}.json", { targetLocales: ["de "] });
    expectSdkError(() => createLocalePathResolver(CWD, config), "LOCALE_LAYOUT_INVALID");
  });

  it("refuses a hostile source locale as well as a hostile target", () => {
    const config = makeConfig("locales/{locale}.json", { sourceLocale: "../../etc/passwd" });
    expectSdkError(() => createLocalePathResolver(CWD, config), "LOCALE_LAYOUT_INVALID");
  });

  it("refuses a hostile locale passed to pathFor after construction", () => {
    const resolver = createLocalePathResolver(CWD, makeConfig("locales/{locale}.json"));
    expectSdkError(() => resolver.pathFor("../../etc/passwd"), "LOCALE_LAYOUT_INVALID");
  });

  it("keeps a locale that merely contains a dot", () => {
    const config = makeConfig("locales/{locale}.json", { targetLocales: ["de.old"] });
    expect(relativePathFor(config, "de.old")).toBe("locales/de.old.json");
  });
});

describe("createLocalePathResolver, pattern validation", () => {
  it("refuses a pattern with no locale token", () => {
    const config = makeConfig("locales/common.json");
    expectSdkError(() => createLocalePathResolver(CWD, config), "LOCALE_LAYOUT_INVALID");
  });
});

describe("createLocalePathResolver, collisions", () => {
  it("refuses two targets that differ only in case under android", () => {
    const config = makeConfig("res/{locale}/strings.xml", {
      targetLocales: ["sr-Latn", "sr-latn"],
      localeStyle: "android",
    });
    expectSdkError(() => createLocalePathResolver(CWD, config), "LOCALE_PATH_COLLISION");
  });

  it("refuses two targets differing only in case under android", () => {
    const config = makeConfig("res/{locale}/strings.xml", {
      targetLocales: ["de", "DE"],
      localeStyle: "android",
    });
    expectSdkError(() => createLocalePathResolver(CWD, config), "LOCALE_PATH_COLLISION");
  });

  it("keeps the source's unqualified directory clear of a case-differing target", () => {
    const config = makeConfig("res/{locale}/strings.xml", {
      sourceLocale: "en-US",
      targetLocales: ["en-us"],
      localeStyle: "android",
    });
    const resolver = createLocalePathResolver(CWD, config);
    expect(relativePathFor(config, "en-US")).toBe("res/values/strings.xml");
    expect(resolver.pathFor("en-us")).toBe(resolve(CWD, "res/values-en-rUS/strings.xml"));
  });

  it("names both colliding locales in the message", () => {
    const config = makeConfig("res/{locale}/strings.xml", {
      targetLocales: ["sr-Latn", "SR-latn"],
      localeStyle: "android",
    });
    expect(() => createLocalePathResolver(CWD, config)).toThrow(/sr-Latn.*SR-latn/);
  });

  it("allows case-differing locales under literal, which spells them apart", () => {
    const config = makeConfig("locales/{locale}.json", {
      targetLocales: ["en-US", "en-us"],
    });
    expect(() => createLocalePathResolver(CWD, config)).not.toThrow();
  });

  it("tolerates the same locale listed twice, which claims one path once", () => {
    const config = makeConfig("locales/{locale}.json", { targetLocales: ["de", "de"] });
    expect(() => createLocalePathResolver(CWD, config)).not.toThrow();
  });
});

describe("localeFor", () => {
  const config = makeConfig("locales/{locale}.json", { targetLocales: ["de", "pt-BR"] });

  it("inverts the forward map for the source locale", () => {
    const resolver = createLocalePathResolver(CWD, config);
    expect(resolver.localeFor(resolve(CWD, "locales/en.json"))).toBe("en");
  });

  it("inverts the forward map for every configured target", () => {
    const resolver = createLocalePathResolver(CWD, config);
    expect(resolver.localeFor(resolve(CWD, "locales/de.json"))).toBe("de");
    expect(resolver.localeFor(resolve(CWD, "locales/pt-BR.json"))).toBe("pt-BR");
  });

  it("resolves a relative argument against the resolver's cwd", () => {
    const resolver = createLocalePathResolver(CWD, config);
    expect(resolver.localeFor("locales/de.json")).toBe("de");
  });

  it("normalizes a redundant path before looking it up", () => {
    const resolver = createLocalePathResolver(CWD, config);
    expect(resolver.localeFor(resolve(CWD, "locales/./nested/../de.json"))).toBe("de");
  });

  it("answers undefined for a path this project does not own", () => {
    const resolver = createLocalePathResolver(CWD, config);
    expect(resolver.localeFor(resolve(CWD, "locales/fr.json"))).toBeUndefined();
    expect(resolver.localeFor(resolve(CWD, "package.json"))).toBeUndefined();
  });

  it("matches exactly, so a case-differing path does not resolve", () => {
    const resolver = createLocalePathResolver(CWD, config);
    expect(resolver.localeFor(resolve(CWD, "Locales/DE.json"))).toBeUndefined();
  });

  it("inverts the android map, including the unqualified source directory", () => {
    const androidConfig = makeConfig("res/{locale}/strings.xml", {
      targetLocales: ["de", "zh-Hans"],
      localeStyle: "android",
    });
    const resolver = createLocalePathResolver(CWD, androidConfig);
    expect(resolver.localeFor(resolve(CWD, "res/values/strings.xml"))).toBe("en");
    expect(resolver.localeFor(resolve(CWD, "res/values-de/strings.xml"))).toBe("de");
    expect(resolver.localeFor(resolve(CWD, "res/values-b+zh+Hans/strings.xml"))).toBe("zh-Hans");
    expect(resolver.localeFor(resolve(CWD, "res/values-zh/strings.xml"))).toBeUndefined();
  });
});

describe("createLocalePathResolver, shared-catalogue formats", () => {
  const SHARED_FORMAT: LocalePathResolverConfig["format"] = "apple-xcstrings";

  it("resolves every target locale to the identical path", () => {
    const config = makeConfig("{locale}Localizable.xcstrings", {
      targetLocales: ["de", "fr", "es"],
      format: SHARED_FORMAT,
    });
    const resolver = createLocalePathResolver(CWD, config);
    const expected = resolve(CWD, "Localizable.xcstrings");
    expect(resolver.pathFor("de")).toBe(expected);
    expect(resolver.pathFor("fr")).toBe(expected);
    expect(resolver.pathFor("es")).toBe(expected);
  });

  it("resolves the source locale to the same shared path as every target", () => {
    const config = makeConfig("{locale}Localizable.xcstrings", {
      sourceLocale: "en",
      targetLocales: ["de"],
      format: SHARED_FORMAT,
    });
    const resolver = createLocalePathResolver(CWD, config);
    expect(resolver.pathFor("en")).toBe(resolver.pathFor("de"));
  });

  it("still requires the {locale} token in the pattern text", () => {
    const config = makeConfig("Localizable.xcstrings", {
      targetLocales: ["de"],
      format: SHARED_FORMAT,
    });
    expectSdkError(() => createLocalePathResolver(CWD, config), "LOCALE_LAYOUT_INVALID");
  });

  it("does not throw LOCALE_PATH_COLLISION for locales sharing one path", () => {
    const config = makeConfig("{locale}Localizable.xcstrings", {
      targetLocales: ["de", "fr", "es", "it"],
      format: SHARED_FORMAT,
    });
    expect(() => createLocalePathResolver(CWD, config)).not.toThrow();
  });

  it("ignores localeStyle entirely for a shared-catalogue format", () => {
    const config = makeConfig("{locale}Localizable.xcstrings", {
      targetLocales: ["pt-BR"],
      format: SHARED_FORMAT,
      localeStyle: "posix",
    });
    const resolver = createLocalePathResolver(CWD, config);
    expect(resolver.pathFor("pt-BR")).toBe(resolve(CWD, "Localizable.xcstrings"));
  });

  it("returns undefined from localeFor for every path, including the shared one", () => {
    const config = makeConfig("{locale}Localizable.xcstrings", {
      targetLocales: ["de", "fr"],
      format: SHARED_FORMAT,
    });
    const resolver = createLocalePathResolver(CWD, config);
    expect(resolver.localeFor(resolve(CWD, "Localizable.xcstrings"))).toBeUndefined();
    expect(resolver.localeFor(resolve(CWD, "nowhere.xcstrings"))).toBeUndefined();
  });
});
