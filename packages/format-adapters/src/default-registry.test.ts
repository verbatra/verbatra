import { SUPPORTED_FORMATS } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { createDefaultRegistry } from "./default-registry.js";

describe("createDefaultRegistry", () => {
  it("registers all JSON adapters, so a bare .json is ambiguous", () => {
    const result = createDefaultRegistry().resolve("locales/en/common.json");
    expect(result.status).toBe("ambiguous");
    if (result.status === "ambiguous") {
      expect(result.candidates).toEqual([
        "i18next-json",
        "vue-i18n-json",
        "next-intl-json",
        "ngx-translate-json",
      ]);
    }
  });

  it("resolves a specific adapter by explicit format", () => {
    const result = createDefaultRegistry().resolve("en.json", { format: "i18next-json" });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.adapter.format).toBe("i18next-json");
    }
  });

  it.each([
    ["xliff", "messages.xlf"],
    ["xliff", "messages.xliff"],
    ["yaml", "en.yml"],
    ["yaml", "en.yaml"],
    ["arb", "app_en.arb"],
    ["properties", "messages.properties"],
    ["apple-strings", "Localizable.strings"],
    ["android-xml", "strings.xml"],
    ["gettext-po", "messages.po"],
    ["gettext-po", "messages.pot"],
  ] as const)("resolves the %s adapter by detection from %s", (format, file) => {
    const result = createDefaultRegistry().resolve(file);
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.adapter.format).toBe(format);
    }
  });

  it.each([
    "xliff",
    "yaml",
    "arb",
    "properties",
    "apple-strings",
    "android-xml",
    "gettext-po",
  ] as const)("resolves %s by explicit format", (format) => {
    const result = createDefaultRegistry().resolve("file", { format });
    expect(result.status).toBe("resolved");
    if (result.status === "resolved") {
      expect(result.adapter.format).toBe(format);
    }
  });

  it("reports no-match for an unsupported extension", () => {
    expect(createDefaultRegistry().resolve("messages.mo").status).toBe("no-match");
  });

  it("registers an adapter for every member of SUPPORTED_FORMATS, so the enum and the registry cannot drift", () => {
    const registry = createDefaultRegistry();
    for (const format of SUPPORTED_FORMATS) {
      const result = registry.resolve("file", { format });
      expect(result.status).toBe("resolved");
      if (result.status === "resolved") {
        expect(result.adapter.format).toBe(format);
      }
    }
  });
});
