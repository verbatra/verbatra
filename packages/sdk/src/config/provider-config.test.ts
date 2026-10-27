import { describe, expect, it, vi } from "vitest";
import { SdkError } from "../errors.js";
import {
  buildProvider,
  hasProviderFactory,
  PROVIDER_IDS,
  providerConfigSchema,
} from "./provider-config.js";

const validOpenAiCompatible = {
  id: "openai-compatible" as const,
  options: {
    baseUrl: "http://192.168.178.74:1234",
    model: "qwen2.5-14b-instruct",
    maxOutputTokens: 1024,
  },
};

describe("providerConfigSchema: openai-compatible", () => {
  it("accepts baseUrl, model, and maxOutputTokens with no apiKeyEnvVar", () => {
    const result = providerConfigSchema.safeParse(validOpenAiCompatible);
    expect(result.success).toBe(true);
  });

  it("accepts an optional apiKeyEnvVar naming a non-hosted variable", () => {
    const result = providerConfigSchema.safeParse({
      ...validOpenAiCompatible,
      options: { ...validOpenAiCompatible.options, apiKeyEnvVar: "LM_STUDIO_KEY" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed baseUrl with a ZodError at config-parse time, not a runtime ProviderError", () => {
    const result = providerConfigSchema.safeParse({
      ...validOpenAiCompatible,
      options: { ...validOpenAiCompatible.options, baseUrl: "not-a-url" },
    });
    expect(result.success).toBe(false);
    expect(result.error?.constructor.name).toBe("ZodError");
  });

  it.each([
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "DEEPL_API_KEY",
    "GOOGLE_TRANSLATE_API_KEY",
  ])("rejects apiKeyEnvVar naming the hosted %s variable", (hostedVar) => {
    const result = providerConfigSchema.safeParse({
      ...validOpenAiCompatible,
      options: { ...validOpenAiCompatible.options, apiKeyEnvVar: hostedVar },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown extra option (strict schema)", () => {
    const result = providerConfigSchema.safeParse({
      ...validOpenAiCompatible,
      options: { ...validOpenAiCompatible.options, unknownField: "x" },
    });
    expect(result.success).toBe(false);
  });
});

describe("providerConfigSchema: an endpoint path as baseUrl", () => {
  it("rejects an openai-compatible baseUrl ending in /chat/completions at options.baseUrl", () => {
    const result = providerConfigSchema.safeParse({
      ...validOpenAiCompatible,
      options: {
        ...validOpenAiCompatible.options,
        baseUrl: "https://opencode.ai/zen/go/v1/chat/completions",
      },
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues).toEqual([
      expect.objectContaining({
        path: ["options", "baseUrl"],
        message: expect.stringContaining("must be the API root"),
      }),
    ]);
  });

  it("leaves a libretranslate baseUrl unchecked for endpoint paths", () => {
    const result = providerConfigSchema.safeParse({
      id: "libretranslate",
      options: { baseUrl: "http://localhost:5000/chat/completions" },
    });
    expect(result.success).toBe(true);
  });
});

describe("buildProvider: openai-compatible", () => {
  it("constructs the provider from config with no API key set anywhere", () => {
    const provider = buildProvider(validOpenAiCompatible);
    expect(provider.id).toBe("openai-compatible");
    expect(provider.kind).toBe("llm");
  });

  it("constructs the provider with a localeMap in its options", () => {
    const provider = buildProvider({
      ...validOpenAiCompatible,
      options: { ...validOpenAiCompatible.options, localeMap: { de: "de-DE" } },
    });
    expect(provider.id).toBe("openai-compatible");
  });
});

describe("providerConfigSchema: opencode", () => {
  const options = { model: "glm-5.3", maxOutputTokens: 4096 };

  it("accepts a model and an output token limit", () => {
    expect(providerConfigSchema.safeParse({ id: "opencode", options }).success).toBe(true);
  });

  it("rejects a baseUrl: the endpoint is fixed", () => {
    const result = providerConfigSchema.safeParse({
      id: "opencode",
      options: { ...options, baseUrl: "https://example.com/v1" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an apiKeyEnvVar: the key variable is fixed", () => {
    const result = providerConfigSchema.safeParse({
      id: "opencode",
      options: { ...options, apiKeyEnvVar: "MY_KEY" },
    });
    expect(result.success).toBe(false);
  });
});

describe("buildProvider: opencode", () => {
  it("reads OPENCODE_API_KEY and builds an llm provider", () => {
    vi.stubEnv("OPENCODE_API_KEY", "oc_sk_test");
    try {
      const provider = buildProvider({
        id: "opencode",
        options: { model: "glm-5.3", maxOutputTokens: 4096 },
      });
      expect(provider.id).toBe("opencode");
      expect(provider.kind).toBe("llm");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("fails naming OPENCODE_API_KEY when it is not set", () => {
    vi.stubEnv("OPENCODE_API_KEY", "");
    try {
      expect(() =>
        buildProvider({ id: "opencode", options: { model: "glm-5.3", maxOutputTokens: 4096 } }),
      ).toThrow(/OPENCODE_API_KEY/);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

describe("providerConfigSchema: google-translate", () => {
  it("accepts an empty options object", () => {
    const result = providerConfigSchema.safeParse({ id: "google-translate", options: {} });
    expect(result.success).toBe(true);
  });

  it("accepts an optional requestTimeoutMs", () => {
    const result = providerConfigSchema.safeParse({
      id: "google-translate",
      options: { requestTimeoutMs: 5000 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown extra option (strict schema, no model or glossaryId)", () => {
    const result = providerConfigSchema.safeParse({
      id: "google-translate",
      options: { model: "gemini-2.5-flash" },
    });
    expect(result.success).toBe(false);
  });
});

describe("buildProvider: google-translate", () => {
  it("constructs a machine-translation provider from config", () => {
    const saved = process.env.GOOGLE_TRANSLATE_API_KEY;
    process.env.GOOGLE_TRANSLATE_API_KEY = `AIza${"a".repeat(35)}`;
    try {
      const provider = buildProvider({ id: "google-translate", options: {} });
      expect(provider.id).toBe("google-translate");
      expect(provider.kind).toBe("machine-translation");
    } finally {
      if (saved === undefined) {
        delete process.env.GOOGLE_TRANSLATE_API_KEY;
      } else {
        process.env.GOOGLE_TRANSLATE_API_KEY = saved;
      }
    }
  });
});

describe("hasProviderFactory: membership without construction", () => {
  it("answers true for every id the schema accepts but none, so the two can never drift apart", () => {
    const ids = providerConfigSchema.options.map((option) => option.shape.id.value);
    expect(ids.filter((id) => !hasProviderFactory(id))).toEqual(["none"]);
    expect(ids.filter((id) => id !== "none").sort()).toEqual([...PROVIDER_IDS].sort());
  });

  it("answers false for an id no factory is registered under", () => {
    expect(hasProviderFactory("mistral")).toBe(false);
    expect(hasProviderFactory("toString")).toBe(false);
  });
});

describe("providerConfigSchema: none", () => {
  it("fills in empty options for a bare none provider, so options exists on every variant", () => {
    expect(providerConfigSchema.parse({ id: "none" })).toEqual({ id: "none", options: {} });
  });

  it("accepts an explicit empty options object", () => {
    expect(providerConfigSchema.safeParse({ id: "none", options: {} }).success).toBe(true);
  });

  it("rejects any option on none, since human-only mode has nothing to configure", () => {
    expect(providerConfigSchema.safeParse({ id: "none", options: { model: "x" } }).success).toBe(
      false,
    );
  });
});

describe("buildProvider: none", () => {
  it("refuses with MACHINE_TRANSLATION_DISABLED instead of reaching a factory", () => {
    let caught: unknown;
    try {
      buildProvider({ id: "none", options: {} });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(SdkError);
    expect(caught).toMatchObject({ code: "MACHINE_TRANSLATION_DISABLED" });
  });
});
