import { describe, expect, it } from "vitest";
import { anthropicConfigSchema } from "./anthropic/config.js";
import { deepLConfigSchema } from "./deepl/config.js";
import { geminiConfigSchema } from "./gemini/config.js";
import { googleTranslateConfigSchema } from "./google-translate/config.js";
import {
  LOCALE_MAP_VALUE_MAX_LENGTH,
  localeMapConfigSchema,
  parseLocale,
  resolveProviderLocale,
} from "./locale-map.js";
import { openAiConfigSchema } from "./openai/config.js";
import { openAiCompatibleConfigSchema } from "./openai-compatible/config.js";

describe("resolveProviderLocale", () => {
  it("returns the mapped code when the locale has an entry", () => {
    expect(resolveProviderLocale("zh-Hant", { "zh-Hant": "zh-TW" }, () => "unused")).toBe("zh-TW");
  });

  it("normalizes a locale without an entry", () => {
    expect(resolveProviderLocale("de", { fr: "FR" }, (locale) => locale.toUpperCase())).toBe("DE");
  });

  it("keeps the locale when there is neither an entry nor a normalizer", () => {
    expect(resolveProviderLocale("pt-BR", undefined)).toBe("pt-BR");
  });

  it("ignores inherited object properties", () => {
    expect(resolveProviderLocale("toString", {})).toBe("toString");
  });

  it("matches the configured spelling exactly", () => {
    expect(resolveProviderLocale("zh-hant", { "zh-Hant": "ZH-HANT" })).toBe("zh-hant");
  });
});

describe("parseLocale", () => {
  it("returns undefined for a code Intl rejects", () => {
    expect(parseLocale("en_US")).toBeUndefined();
  });

  it("returns only the subtags that are present", () => {
    expect(parseLocale("de")).toEqual({ language: "de" });
    expect(parseLocale("zh-Hant-TW")).toEqual({ language: "zh", script: "Hant", region: "TW" });
  });
});

describe("localeMapConfigSchema", () => {
  it("accepts a map of locale codes to provider codes", () => {
    expect(localeMapConfigSchema.parse({ localeMap: { "zh-Hant": "ZH-HANT" } })).toEqual({
      localeMap: { "zh-Hant": "ZH-HANT" },
    });
  });

  it("accepts a code of exactly the maximum length", () => {
    const localeMap = { de: "x".repeat(LOCALE_MAP_VALUE_MAX_LENGTH) };
    expect(localeMapConfigSchema.safeParse({ localeMap }).success).toBe(true);
  });

  it("rejects a code longer than 64 characters", () => {
    const localeMap = { de: "x".repeat(LOCALE_MAP_VALUE_MAX_LENGTH + 1) };
    expect(LOCALE_MAP_VALUE_MAX_LENGTH).toBe(64);
    expect(localeMapConfigSchema.safeParse({ localeMap }).success).toBe(false);
  });

  it.each([[{ "": "DE" }], [{ de: "" }], [{ de: 7 }]])(
    "rejects an empty key, an empty code, or a non-string code: %j",
    (localeMap) => {
      expect(localeMapConfigSchema.safeParse({ localeMap }).success).toBe(false);
    },
  );

  it.each([
    ["anthropic", anthropicConfigSchema, { model: "m", maxTokens: 1 }],
    ["openai", openAiConfigSchema, { model: "m", maxOutputTokens: 1 }],
    ["gemini", geminiConfigSchema, { model: "m", maxOutputTokens: 1 }],
    ["deepl", deepLConfigSchema, {}],
    ["google-translate", googleTranslateConfigSchema, {}],
    [
      "openai-compatible",
      openAiCompatibleConfigSchema,
      { baseUrl: "http://localhost:1234/v1", model: "m", maxOutputTokens: 1 },
    ],
  ] as const)("is part of the %s provider options", (_name, schema, base) => {
    const parsed = schema.strict().parse({ ...base, localeMap: { de: "de-DE" } });
    expect(parsed.localeMap).toEqual({ de: "de-DE" });
  });
});
