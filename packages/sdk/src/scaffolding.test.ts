import { describe, expect, it } from "vitest";
import { CONFIG_SEARCH_PLACES } from "./config/load-config.js";
import type { ProviderId } from "./config/provider-config.js";
import { providerConfigSchema } from "./config/provider-config.js";
import type { ScaffoldableProviderId } from "./scaffolding.js";
import { scaffoldingMetadata } from "./scaffolding.js";

describe("scaffoldingMetadata", () => {
  it("is frozen at every level, so a caller cannot rewrite what the SDK reads", () => {
    expect(Object.isFrozen(scaffoldingMetadata)).toBe(true);
    for (const table of Object.values(scaffoldingMetadata)) {
      if (typeof table === "object") {
        expect(Object.isFrozen(table)).toBe(true);
      }
    }
    expect(() => {
      (scaffoldingMetadata.providerEnv as Record<string, string>).anthropic = "STOLEN";
    }).toThrow(TypeError);
    expect(() => {
      (scaffoldingMetadata.configSearchPlaces as string[]).push("evil.config.js");
    }).toThrow(TypeError);
    expect(scaffoldingMetadata.providerEnv.anthropic).toBe("ANTHROPIC_API_KEY");
  });

  it("freezes its own copies rather than the tables the SDK loads configs with", () => {
    expect(Object.isFrozen(CONFIG_SEARCH_PLACES)).toBe(false);
    expect(scaffoldingMetadata.configSearchPlaces).toEqual(CONFIG_SEARCH_PLACES);
  });

  it("exposes the pass-through tables, the human-only provider id, and the config file names", () => {
    expect(Object.keys(scaffoldingMetadata).sort()).toEqual([
      "configSearchPlaces",
      "humanOnlyProviderId",
      "libreTranslateKeyEnv",
      "openAiCompatibleKeyEnv",
      "providerEnv",
      "providerTokenLimitKeys",
      "scaffoldModels",
      "supportedFormats",
    ]);
  });

  it("names the openai-compatible key variable and the searched config files", () => {
    expect(scaffoldingMetadata.openAiCompatibleKeyEnv).toBe("OPENAI_COMPATIBLE_API_KEY");
    expect(scaffoldingMetadata.configSearchPlaces).toContain("verbatra.config.ts");
    expect(scaffoldingMetadata.configSearchPlaces).toContain(".verbatrarc.json");
  });

  it("names none as the human-only provider id, a schema-accepted id with no key variable", () => {
    expect(scaffoldingMetadata.humanOnlyProviderId).toBe("none");
    expect(scaffoldingMetadata.providerEnv).not.toHaveProperty("none");
  });

  it("maps each provider id to its environment variable name", () => {
    expect(scaffoldingMetadata.providerEnv).toEqual({
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      gemini: "GEMINI_API_KEY",
      deepl: "DEEPL_API_KEY",
      "google-translate": "GOOGLE_TRANSLATE_API_KEY",
    });
  });

  it("covers every ProviderId in providerEnv except openai-compatible, libretranslate and none", () => {
    const providerIds = providerConfigSchema.options
      .map((variant) => variant.shape.id.value as ProviderId)
      .filter((id) => id !== "openai-compatible" && id !== "libretranslate" && id !== "none");
    for (const id of providerIds) {
      const envVar = scaffoldingMetadata.providerEnv[id as ScaffoldableProviderId];
      expect(envVar).toBeTypeOf("string");
      expect(envVar.length).toBeGreaterThan(0);
    }
    expect(Object.keys(scaffoldingMetadata.providerEnv).sort()).toEqual([...providerIds].sort());
  });

  it("omits openai-compatible: it has no single required env var", () => {
    const providerIds = providerConfigSchema.options.map((variant) => variant.shape.id.value);
    expect(providerIds).toContain("openai-compatible");
    expect(scaffoldingMetadata.providerEnv).not.toHaveProperty("openai-compatible");
  });

  it("omits libretranslate and names its optional key variable separately", () => {
    expect(scaffoldingMetadata.providerEnv).not.toHaveProperty("libretranslate");
    expect(scaffoldingMetadata.libreTranslateKeyEnv).toBe("LIBRETRANSLATE_API_KEY");
  });

  it("omits none: human-only mode reads no API key at all", () => {
    const providerIds = providerConfigSchema.options.map((variant) => variant.shape.id.value);
    expect(providerIds).toContain("none");
    expect(scaffoldingMetadata.providerEnv).not.toHaveProperty("none");
  });

  it("exposes the three LLM scaffold models (DeepL omitted)", () => {
    expect(scaffoldingMetadata.scaffoldModels).toEqual({
      anthropic: "claude-sonnet-4-6",
      openai: "gpt-5.4-mini",
      gemini: "gemini-2.5-flash",
    });
  });

  it("names a token limit key for every provider that has a scaffold model", () => {
    expect(Object.keys(scaffoldingMetadata.providerTokenLimitKeys).sort()).toEqual(
      Object.keys(scaffoldingMetadata.scaffoldModels).sort(),
    );
  });

  it("names a token limit key each provider's own options schema accepts", () => {
    for (const [id, tokenKey] of Object.entries(scaffoldingMetadata.providerTokenLimitKeys)) {
      const model =
        scaffoldingMetadata.scaffoldModels[id as keyof typeof scaffoldingMetadata.scaffoldModels];
      const parsed = providerConfigSchema.safeParse({
        id,
        options: { model, [tokenKey]: 4096 },
      });

      expect(parsed.error?.issues ?? []).toEqual([]);
      expect(parsed.success).toBe(true);
    }
  });

  it("names a token limit key that is the only one that provider accepts", () => {
    const everyTokenKey = new Set(Object.values(scaffoldingMetadata.providerTokenLimitKeys));

    for (const [id, tokenKey] of Object.entries(scaffoldingMetadata.providerTokenLimitKeys)) {
      const model =
        scaffoldingMetadata.scaffoldModels[id as keyof typeof scaffoldingMetadata.scaffoldModels];
      for (const otherKey of everyTokenKey) {
        if (otherKey === tokenKey) {
          continue;
        }
        const parsed = providerConfigSchema.safeParse({
          id,
          options: { model, [otherKey]: 4096 },
        });

        expect(parsed.success).toBe(false);
      }
    }
  });

  it("exposes core's supported format ids", () => {
    expect(scaffoldingMetadata.supportedFormats).toContain("i18next-json");
    expect(scaffoldingMetadata.supportedFormats.length).toBeGreaterThan(0);
  });
});
