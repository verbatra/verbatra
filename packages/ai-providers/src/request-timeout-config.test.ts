import { describe, expect, it } from "vitest";
import { anthropicConfigSchema } from "./anthropic/config.js";
import { deepLConfigSchema } from "./deepl/config.js";
import { geminiConfigSchema } from "./gemini/config.js";
import { openAiConfigSchema } from "./openai/config.js";
import { openAiCompatibleConfigSchema } from "./openai-compatible/config.js";
import { requestTimeoutConfigSchema } from "./request-timeout-config.js";

describe("requestTimeoutConfigSchema", () => {
  it("accepts a config with no requestTimeoutMs field at all", () => {
    expect(requestTimeoutConfigSchema.parse({})).toEqual({});
  });

  it("accepts a positive integer", () => {
    expect(requestTimeoutConfigSchema.parse({ requestTimeoutMs: 30_000 })).toEqual({
      requestTimeoutMs: 30_000,
    });
  });

  it("rejects zero", () => {
    expect(requestTimeoutConfigSchema.safeParse({ requestTimeoutMs: 0 }).success).toBe(false);
  });

  it("rejects a negative number", () => {
    expect(requestTimeoutConfigSchema.safeParse({ requestTimeoutMs: -1 }).success).toBe(false);
  });

  it("rejects a non-integer", () => {
    expect(requestTimeoutConfigSchema.safeParse({ requestTimeoutMs: 1.5 }).success).toBe(false);
  });
});

interface ProviderConfigSchema {
  readonly shape: Record<string, unknown>;
  safeParse(value: unknown): { success: boolean };
}

describe("requestTimeoutConfigSchema: merged into every provider config", () => {
  const cases: ReadonlyArray<{
    readonly name: string;
    readonly schema: ProviderConfigSchema;
    readonly validBase: Record<string, unknown>;
    readonly fieldOrder: readonly string[];
  }> = [
    {
      name: "anthropic",
      schema: anthropicConfigSchema,
      validBase: { model: "m", maxTokens: 1 },
      fieldOrder: ["model", "maxTokens", "requestTimeoutMs", "localeMap"],
    },
    {
      name: "openai",
      schema: openAiConfigSchema,
      validBase: { model: "m", maxOutputTokens: 1 },
      fieldOrder: ["model", "maxOutputTokens", "requestTimeoutMs", "localeMap"],
    },
    {
      name: "gemini",
      schema: geminiConfigSchema,
      validBase: { model: "m", maxOutputTokens: 1 },
      fieldOrder: ["model", "maxOutputTokens", "requestTimeoutMs", "localeMap"],
    },
    {
      name: "deepl",
      schema: deepLConfigSchema,
      validBase: {},
      fieldOrder: ["glossaryId", "requestTimeoutMs", "localeMap"],
    },
    {
      name: "openai-compatible",
      schema: openAiCompatibleConfigSchema,
      validBase: { baseUrl: "http://localhost:1234", model: "m", maxOutputTokens: 1 },
      fieldOrder: [
        "baseUrl",
        "model",
        "maxOutputTokens",
        "apiKeyEnvVar",
        "requestTimeoutMs",
        "localeMap",
      ],
    },
  ];

  it.each(cases)("$name: accepts a valid positive requestTimeoutMs", ({ schema, validBase }) => {
    expect(schema.safeParse({ ...validBase, requestTimeoutMs: 5000 }).success).toBe(true);
  });

  it.each(cases)("$name: rejects a zero requestTimeoutMs", ({ schema, validBase }) => {
    expect(schema.safeParse({ ...validBase, requestTimeoutMs: 0 }).success).toBe(false);
  });

  it.each(cases)("$name: accepts a config that omits requestTimeoutMs", ({ schema, validBase }) => {
    expect(schema.safeParse(validBase).success).toBe(true);
  });

  it.each(cases)(
    "$name: preserves the original field order, so a multi-error report keeps its order",
    ({ schema, fieldOrder }) => {
      expect(Object.keys(schema.shape)).toEqual(fieldOrder);
    },
  );
});
