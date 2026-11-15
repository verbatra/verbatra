import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  DEFAULT_LOCALE,
  LOCALES,
  localeAlternation,
  localePrefix,
  localeSuffixes,
  TRANSLATED_LOCALES,
  translationFilePattern,
} from "./locales";
import { markdownPathPatterns } from "./markdown-route";

const REGIONAL = ["en", "zh-CN", "pt-BR"];

describe("locale source of truth", () => {
  it("pins the supported locales and the default", () => {
    expect([...LOCALES]).toEqual(["en", "de", "es", "fr", "zh-CN", "pt-BR"]);
    expect(DEFAULT_LOCALE).toBe("en");
  });

  it("lists every locale once, default first, and no region-less duplicate", () => {
    expect(new Set(LOCALES).size).toBe(LOCALES.length);
    const regionless = LOCALES.filter((locale) => locale.includes("-")).map(
      (locale) => locale.split("-")[0],
    );
    expect(regionless.filter((language) => LOCALES.some((locale) => locale === language))).toEqual(
      [],
    );
    expect(LOCALES[0]).toBe(DEFAULT_LOCALE);
    expect(TRANSLATED_LOCALES).toEqual(LOCALES.slice(1));
  });

  it("derives one file suffix per translated locale after the empty English one", () => {
    expect(localeSuffixes()).toEqual(["", ...TRANSLATED_LOCALES.map((locale) => `.${locale}`)]);
  });
});

describe("locales.ts as loaded by the published CLI", () => {
  it("has no import, static or dynamic, so verbatra.config.ts can load it without the app resolver", () => {
    const source = readFileSync(new URL("./locales.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/\bimport\b|\brequire\s*\(|\bfrom\s+["']/);
  });
});

describe("localePrefix", () => {
  it("leaves the default locale unprefixed and prefixes every other with a slash", () => {
    expect(LOCALES.map((locale) => localePrefix(locale))).toEqual([
      "",
      "/de",
      "/es",
      "/fr",
      "/zh-CN",
      "/pt-BR",
    ]);
  });
});

describe("region-qualified locale codes", () => {
  it("builds an alternation that keeps the hyphen literal", () => {
    expect(localeAlternation(REGIONAL)).toBe("en|zh-CN|pt-BR");
  });

  it("recognises a translated file carrying a region-qualified code", () => {
    const pattern = translationFilePattern(["zh-CN", "pt-BR"]);
    expect(pattern.exec("cli/translate.zh-CN.mdx")?.slice(1)).toEqual(["cli/translate", "zh-CN"]);
    expect(pattern.exec("cli/translate.pt-BR.mdx")?.[1]).toBe("cli/translate");
    expect(pattern.test("cli/translate.mdx")).toBe(false);
    expect(pattern.test("cli/translate.xx.mdx")).toBe(false);
  });

  it("matches the markdown routes under a region-qualified prefix", () => {
    const { docs, page, homeMarkdown, internalDocs, internalSite, publicMdx } =
      markdownPathPatterns(REGIONAL);
    expect(docs.exec("/zh-CN/docs/formats")?.slice(1)).toEqual(["zh-CN", "/formats"]);
    expect(docs.exec("/pt-BR/docs")?.[1]).toBe("pt-BR");
    expect(page.exec("/pt-BR/compare")?.slice(1)).toEqual(["pt-BR", "/compare"]);
    expect(homeMarkdown.exec("/zh-CN/index")?.[1]).toBe("zh-CN");
    expect(internalDocs.exec("/zh-CN/docs.mdx/formats")?.slice(1)).toEqual(["zh-CN", "/formats"]);
    expect(internalSite.exec("/pt-BR/site.mdx/compare")?.slice(1)).toEqual(["pt-BR", "compare"]);
    expect(publicMdx.exec("/zh-CN/docs/formats.mdx")?.slice(1)).toEqual(["zh-CN", "/docs/formats"]);
  });

  it("does not take a differently cased or unlisted region code for a locale", () => {
    const { docs } = markdownPathPatterns(REGIONAL);
    expect(docs.test("/zh-cn/docs/formats")).toBe(false);
    expect(docs.test("/zh/docs/formats")).toBe(false);
  });
});
