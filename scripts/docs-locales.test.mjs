import { describe, expect, it } from "vitest";
import {
  assertLocaleTable,
  DEFAULT_LOCALE,
  isTranslationFile,
  LOCALE_SUFFIXES,
  LOCALES,
  localeAlternation,
  localeOfFile,
  suffixOfFile,
  TRANSLATED_LOCALES,
  translationFilePattern,
  withoutLocaleSuffix,
} from "./docs-locales.mjs";

describe("docs locale helper", () => {
  it("starts with the default locale and derives one suffix per translation", () => {
    expect(LOCALES[0]).toBe(DEFAULT_LOCALE);
    expect(LOCALE_SUFFIXES).toEqual(["", ...TRANSLATED_LOCALES.map((locale) => `.${locale}`)]);
  });

  it("classifies translation files by the listed locales only", () => {
    const [locale] = TRANSLATED_LOCALES;
    expect(isTranslationFile(`a/b.${locale}.mdx`)).toBe(true);
    expect(isTranslationFile("a/b.mdx")).toBe(false);
    expect(localeOfFile(`b.${locale}.mdx`)).toBe(locale);
    expect(localeOfFile("b.mdx")).toBe(DEFAULT_LOCALE);
    expect(suffixOfFile(`b.${locale}.mdx`)).toBe(`.${locale}`);
    expect(withoutLocaleSuffix(`b.${locale}.mdx`)).toBe("b.mdx");
  });

  it("matches a synthetic region-qualified code", () => {
    expect(localeAlternation(["zh-CN", "pt-BR"])).toBe("zh-CN|pt-BR");
    expect(translationFilePattern(["zh-CN"]).exec("cli/x.zh-CN.mdx")?.slice(1)).toEqual([
      "cli/x",
      "zh-CN",
    ]);
  });

  it("refuses a label table that misses or adds a locale", () => {
    const complete = Object.fromEntries(LOCALE_SUFFIXES.map((suffix) => [suffix, "x"]));
    expect(assertLocaleTable(complete, "table")).toBe(complete);
    const { [LOCALE_SUFFIXES.at(-1)]: _dropped, ...missing } = complete;
    expect(() => assertLocaleTable(missing, "table")).toThrow(/missing/);
    expect(() => assertLocaleTable({ ...complete, ".zz": "x" }, "table")).toThrow(/extra/);
  });
});
