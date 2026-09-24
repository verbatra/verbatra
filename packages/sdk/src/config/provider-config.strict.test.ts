import { describe, expect, it } from "vitest";
import { z } from "zod";
import { baseConfig } from "../test-support.js";
import { loadConfig } from "./load-config.js";
import { providerConfigSchema } from "./provider-config.js";
import { verbatraConfigSchema } from "./schema.js";

const VALID_PROVIDERS = [
  { id: "anthropic", options: { model: "m", maxTokens: 1 } },
  { id: "openai", options: { model: "m", maxOutputTokens: 1 } },
  { id: "gemini", options: { model: "m", maxOutputTokens: 1 } },
  { id: "deepl", options: {} },
  { id: "google-translate", options: {} },
  {
    id: "openai-compatible",
    options: { baseUrl: "http://localhost:1234", model: "m", maxOutputTokens: 1 },
  },
  { id: "none", options: {} },
] as const;

describe("providerConfigSchema: unknown keys beside id and options", () => {
  it.each(VALID_PROVIDERS)("accepts the $id variant without a stray key", (provider) => {
    expect(providerConfigSchema.safeParse(provider).success).toBe(true);
  });

  it.each(VALID_PROVIDERS)("rejects a misplaced localeMap on the $id variant", (provider) => {
    const result = providerConfigSchema.safeParse({ ...provider, localeMap: { de: "de-DE" } });

    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({ code: "unrecognized_keys", keys: ["localeMap"], path: [] }),
    ]);
  });

  it.each(VALID_PROVIDERS)("rejects a typo such as optionss on the $id variant", (provider) => {
    const result = providerConfigSchema.safeParse({ ...provider, optionss: {} });

    expect(result.error?.issues).toEqual([
      expect.objectContaining({ code: "unrecognized_keys", keys: ["optionss"] }),
    ]);
  });
});

describe("loadConfig: an unknown provider key", () => {
  it("fails with CONFIG_INVALID naming the key and its path", async () => {
    const config = {
      ...baseConfig(),
      provider: { id: "deepl", options: {}, localeMap: { de: "de-DE" } },
    };

    await expect(loadConfig({ configOverride: config })).rejects.toMatchObject({
      code: "CONFIG_INVALID",
      message: expect.stringContaining('provider: Unrecognized key: "localeMap"'),
    });
  });
});

type JsonSchemaObject = Readonly<Record<string, unknown>>;

function asObject(value: unknown): JsonSchemaObject {
  return typeof value === "object" && value !== null ? (value as JsonSchemaObject) : {};
}

describe("the config JSON Schema document: the provider block", () => {
  const document: JsonSchemaObject = z.toJSONSchema(verbatraConfigSchema);
  const provider = asObject(asObject(document.properties).provider);
  const variants = (Array.isArray(provider.oneOf) ? provider.oneOf : []).map(asObject);

  it("emits one closed object per provider variant", () => {
    expect(variants).toHaveLength(VALID_PROVIDERS.length);
    for (const variant of variants) {
      expect(variant.additionalProperties).toBe(false);
    }
  });

  it("keeps each variant's options closed too", () => {
    for (const variant of variants) {
      expect(asObject(asObject(variant.properties).options).additionalProperties).toBe(false);
    }
  });
});
