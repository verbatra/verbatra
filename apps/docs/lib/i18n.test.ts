import { describe, expect, it } from "vitest";
import { i18n, isLocale, localizeHref, toLocale } from "./i18n";

describe("i18n configuration", () => {
  it("declares exactly the four supported locales, in order", () => {
    expect(i18n.languages).toEqual(["en", "de", "es", "fr"]);
  });

  it("uses English as both the default and the fallback language", () => {
    expect(i18n.defaultLanguage).toBe("en");
    expect(i18n.fallbackLanguage).toBe("en");
  });

  it("hides the locale segment for the default language only", () => {
    expect(i18n.hideLocale).toBe("default-locale");
  });
});

describe("localizeHref", () => {
  it("passes an undefined href through unchanged", () => {
    expect(localizeHref("de", undefined)).toBeUndefined();
  });

  it("passes a non-internal href through unchanged", () => {
    expect(localizeHref("de", "https://example.com/docs")).toBe("https://example.com/docs");
    expect(localizeHref("de", "mailto:info@kreitz-webdev.de")).toBe("mailto:info@kreitz-webdev.de");
    expect(localizeHref("de", "#section")).toBe("#section");
  });

  it("passes a protocol-relative href through unchanged", () => {
    expect(localizeHref("de", "//example.com/docs")).toBe("//example.com/docs");
  });

  it("passes an href already carrying the active locale prefix through unchanged", () => {
    expect(localizeHref("de", "/de")).toBe("/de");
    expect(localizeHref("de", "/de/docs")).toBe("/de/docs");
  });

  it("prefixes an internal absolute path with the active locale", () => {
    expect(localizeHref("de", "/docs/config-file")).toBe("/de/docs/config-file");
  });

  it("leaves an internal absolute path unprefixed for the default locale", () => {
    expect(localizeHref("en", "/docs/config-file")).toBe("/docs/config-file");
  });
});

describe("isLocale", () => {
  it("accepts every configured locale", () => {
    expect(isLocale("en")).toBe(true);
    expect(isLocale("de")).toBe(true);
    expect(isLocale("es")).toBe(true);
    expect(isLocale("fr")).toBe(true);
  });

  it("rejects a string outside the configured locale set", () => {
    expect(isLocale("xx")).toBe(false);
  });
});

describe("toLocale", () => {
  it("returns a valid locale unchanged", () => {
    expect(toLocale("de")).toBe("de");
  });

  it("throws for a value outside the configured locale set", () => {
    expect(() => toLocale("xx")).toThrow();
  });
});
