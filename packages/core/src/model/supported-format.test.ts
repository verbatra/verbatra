import { describe, expect, it } from "vitest";
import { SUPPORTED_FORMATS, supportedFormatSchema } from "./supported-format.js";

describe("SupportedFormat", () => {
  it("is exactly the JSON and non-JSON i18n formats, in declaration order", () => {
    expect(SUPPORTED_FORMATS).toEqual([
      "i18next-json",
      "vue-i18n-json",
      "next-intl-json",
      "ngx-translate-json",
      "xliff",
      "yaml",
      "arb",
      "properties",
      "apple-strings",
      "apple-xcstrings",
      "android-xml",
      "gettext-po",
    ]);
  });

  it("accepts a known format", () => {
    expect(supportedFormatSchema.parse("i18next-json")).toBe("i18next-json");
  });

  it("accepts each new format through the schema", () => {
    expect(supportedFormatSchema.parse("xliff")).toBe("xliff");
    expect(supportedFormatSchema.parse("yaml")).toBe("yaml");
    expect(supportedFormatSchema.parse("arb")).toBe("arb");
    expect(supportedFormatSchema.parse("properties")).toBe("properties");
    expect(supportedFormatSchema.parse("apple-strings")).toBe("apple-strings");
    expect(supportedFormatSchema.parse("apple-xcstrings")).toBe("apple-xcstrings");
    expect(supportedFormatSchema.parse("android-xml")).toBe("android-xml");
    expect(supportedFormatSchema.parse("gettext-po")).toBe("gettext-po");
  });

  it("rejects an unknown format", () => {
    expect(supportedFormatSchema.safeParse("xliff-1.2").success).toBe(false);
  });
});
