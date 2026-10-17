import { describe, expect, it } from "vitest";
import { ENDPOINT_PATH_BASE_URL_MESSAGE, openAiCompatibleConfigSchema } from "./config.js";

const validConfig = {
  baseUrl: "http://192.168.178.74:1234",
  model: "qwen2.5-14b-instruct",
  maxOutputTokens: 1024,
};

describe("openAiCompatibleConfigSchema: baseUrl", () => {
  it("accepts a plain http LAN address, no key configured", () => {
    expect(openAiCompatibleConfigSchema.parse(validConfig)).toEqual(validConfig);
  });

  it("accepts http://localhost and https URLs", () => {
    expect(() =>
      openAiCompatibleConfigSchema.parse({ ...validConfig, baseUrl: "http://localhost:1234" }),
    ).not.toThrow();
    expect(() =>
      openAiCompatibleConfigSchema.parse({
        ...validConfig,
        baseUrl: "https://my-inference-host.example.com",
      }),
    ).not.toThrow();
  });

  it("rejects a malformed baseUrl with a ZodError at parse time", () => {
    const result = openAiCompatibleConfigSchema.safeParse({ ...validConfig, baseUrl: "not-a-url" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-http(s) scheme (file:) even though it is a syntactically valid URL", () => {
    const result = openAiCompatibleConfigSchema.safeParse({
      ...validConfig,
      baseUrl: "file:///etc/passwd",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a ws: scheme", () => {
    const result = openAiCompatibleConfigSchema.safeParse({
      ...validConfig,
      baseUrl: "ws://192.168.178.74:1234",
    });
    expect(result.success).toBe(false);
  });

  it("still accepts an uppercase scheme, which URL parsing lowercases before comparing", () => {
    expect(
      openAiCompatibleConfigSchema.safeParse({ ...validConfig, baseUrl: "HTTP://localhost:1234" })
        .success,
    ).toBe(true);
  });

  it("names the scheme in the message, so a rejected value says what is wrong", () => {
    const result = openAiCompatibleConfigSchema.safeParse({
      ...validConfig,
      baseUrl: "file:///etc/passwd",
    });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.message)).toContain(
      "baseUrl must use the http or https scheme.",
    );
  });
});

describe("openAiCompatibleConfigSchema: baseUrl names the API root, not an endpoint", () => {
  function messagesFor(baseUrl: string): readonly string[] {
    const result = openAiCompatibleConfigSchema.safeParse({ ...validConfig, baseUrl });
    return result.success ? [] : result.error.issues.map((issue) => issue.message);
  }

  it.each([
    "https://opencode.ai/zen/go/v1/chat/completions",
    "https://opencode.ai/zen/go/v1/chat/completions/",
    "http://localhost:1234/v1/completions",
    "http://localhost:1234/v1/completions//",
    "http://localhost:1234/V1/Chat/Completions",
  ])("rejects %s with a message saying to use the API root", (baseUrl) => {
    expect(messagesFor(baseUrl)).toEqual([ENDPOINT_PATH_BASE_URL_MESSAGE]);
  });

  it.each([
    "https://opencode.ai/zen/go/v1",
    "http://localhost:1234/v1/",
    "http://localhost:11434/v1",
    "https://api.example.com/completions-gateway/v1",
  ])("accepts the API root %s", (baseUrl) => {
    expect(messagesFor(baseUrl)).toEqual([]);
  });

  it("says to use the API root and that verbatra appends the endpoint", () => {
    expect(ENDPOINT_PATH_BASE_URL_MESSAGE).toContain("API root");
    expect(ENDPOINT_PATH_BASE_URL_MESSAGE).toContain("appends /chat/completions");
  });

  it("reports only the URL error for a malformed baseUrl", () => {
    expect(messagesFor("not-a-url")).not.toContain(ENDPOINT_PATH_BASE_URL_MESSAGE);
  });
});

describe("openAiCompatibleConfigSchema: model and maxOutputTokens", () => {
  it("requires a non-empty model", () => {
    expect(openAiCompatibleConfigSchema.safeParse({ ...validConfig, model: "" }).success).toBe(
      false,
    );
  });

  it("requires a positive integer maxOutputTokens", () => {
    expect(
      openAiCompatibleConfigSchema.safeParse({ ...validConfig, maxOutputTokens: 0 }).success,
    ).toBe(false);
    expect(
      openAiCompatibleConfigSchema.safeParse({ ...validConfig, maxOutputTokens: 1.5 }).success,
    ).toBe(false);
  });
});

describe("openAiCompatibleConfigSchema: apiKeyEnvVar", () => {
  it("is optional", () => {
    expect(openAiCompatibleConfigSchema.parse(validConfig).apiKeyEnvVar).toBeUndefined();
  });

  it("accepts an arbitrary non-hosted variable name", () => {
    const config = { ...validConfig, apiKeyEnvVar: "LM_STUDIO_KEY" };
    expect(openAiCompatibleConfigSchema.parse(config).apiKeyEnvVar).toBe("LM_STUDIO_KEY");
  });

  it.each([
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "DEEPL_API_KEY",
    "GOOGLE_TRANSLATE_API_KEY",
  ])(
    "rejects %s: a config author cannot point openai-compatible at a hosted provider's key by name",
    (hostedVar) => {
      const result = openAiCompatibleConfigSchema.safeParse({
        ...validConfig,
        apiKeyEnvVar: hostedVar,
      });
      expect(result.success).toBe(false);
    },
  );

  it.each([
    "openai_api_key",
    "Openai_Api_Key",
    "anthropic_api_key",
    "gemini_api_key",
    "deepl_api_key",
    "google_translate_api_key",
  ])(
    "rejects %s: process.env lookups are case-insensitive on Windows, so a lowercase or mixed-case alias must be rejected too",
    (mixedCaseHostedVar) => {
      const result = openAiCompatibleConfigSchema.safeParse({
        ...validConfig,
        apiKeyEnvVar: mixedCaseHostedVar,
      });
      expect(result.success).toBe(false);
    },
  );

  it("allows OPENAI_COMPATIBLE_API_KEY named explicitly (not in the rejected hosted list)", () => {
    const config = { ...validConfig, apiKeyEnvVar: "OPENAI_COMPATIBLE_API_KEY" };
    expect(openAiCompatibleConfigSchema.parse(config).apiKeyEnvVar).toBe(
      "OPENAI_COMPATIBLE_API_KEY",
    );
  });

  it("rejects an empty apiKeyEnvVar", () => {
    expect(
      openAiCompatibleConfigSchema.safeParse({ ...validConfig, apiKeyEnvVar: "" }).success,
    ).toBe(false);
  });
});
