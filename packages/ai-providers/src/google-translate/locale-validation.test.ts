import { describe, expect, it } from "vitest";
import { ProviderError } from "../errors.js";
import { assertValidGoogleTranslateLocale } from "./locale-validation.js";

describe("assertValidGoogleTranslateLocale", () => {
  it.each(["en", "de", "en-US", "en-GB", "pt-BR", "zh-Hans", "fr-CA"])(
    "accepts a well-formed BCP-47 code %s without throwing",
    (locale) => {
      expect(() => assertValidGoogleTranslateLocale(locale, "source")).not.toThrow();
      expect(() => assertValidGoogleTranslateLocale(locale, "target")).not.toThrow();
    },
  );

  it.each(["", "e", "en_US", "en--US", "123", "en US"])(
    "rejects a malformed code %s as INVALID_REQUEST",
    (locale) => {
      try {
        assertValidGoogleTranslateLocale(locale, "target");
        expect.unreachable("should have thrown");
      } catch (error) {
        expect(error).toBeInstanceOf(ProviderError);
        expect((error as ProviderError).code).toBe("INVALID_REQUEST");
      }
    },
  );

  it("names the offending locale and its role in the message", () => {
    try {
      assertValidGoogleTranslateLocale("en_US", "source");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ProviderError).message).toContain('"en_US"');
      expect((error as ProviderError).message).toContain("source");
    }
  });
});
