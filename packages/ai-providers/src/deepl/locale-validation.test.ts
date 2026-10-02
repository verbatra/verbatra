import { describe, expect, it } from "vitest";
import { ProviderError } from "../errors.js";
import { assertValidDeepLSourceLocale, assertValidDeepLTargetLocale } from "./locale-validation.js";

function thrownBy(run: () => void): ProviderError {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(ProviderError);
    return error as ProviderError;
  }
  expect.unreachable("should have thrown");
}

describe("assertValidDeepLSourceLocale", () => {
  it("rejects a regional source code as INVALID_REQUEST, naming the code verbatim", () => {
    const error = thrownBy(() => assertValidDeepLSourceLocale("de-DE", "de-DE"));
    expect(error.code).toBe("INVALID_REQUEST");
    expect(error.message).toContain('"de-DE"');
    expect(error.message).not.toContain("for the locale");
  });

  it("names the configured locale when a mapped code is rejected", () => {
    const error = thrownBy(() => assertValidDeepLSourceLocale("EN-US", "en"));
    expect(error.message).toContain('"EN-US" (for the locale "en")');
    expect(error.message).toContain("provider.options.localeMap");
  });

  it("passes a bare source code through without throwing", () => {
    expect(() => assertValidDeepLSourceLocale("EN", "en-US")).not.toThrow();
    expect(() => assertValidDeepLSourceLocale("de", "de")).not.toThrow();
  });
});

describe("assertValidDeepLTargetLocale", () => {
  it("rejects a deprecated bare target code (en) requiring disambiguation", () => {
    const error = thrownBy(() => assertValidDeepLTargetLocale("en", "en"));
    expect(error.code).toBe("INVALID_REQUEST");
    expect(error.message).toContain('"en"');
  });

  it("rejects a bare target code case-insensitively and names the configured locale", () => {
    const error = thrownBy(() => assertValidDeepLTargetLocale("EN", "en-AU"));
    expect(error.message).toContain('"EN" (for the locale "en-AU")');
  });

  it("rejects a deprecated bare target code (pt) requiring disambiguation", () => {
    expect(() => assertValidDeepLTargetLocale("pt", "pt")).toThrow(ProviderError);
  });

  it("passes a valid disambiguated target code through without throwing", () => {
    for (const code of ["EN-US", "en-GB", "PT-BR", "ZH-HANS", "zh-Hant", "DE"]) {
      expect(() => assertValidDeepLTargetLocale(code, code)).not.toThrow();
    }
  });
});
