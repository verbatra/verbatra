import { describe, expect, it } from "vitest";
import { endpointContextOf, openAiCompatibleConfigSchema } from "./config.js";

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

describe("endpointContextOf", () => {
  it("returns host and port", () => {
    expect(endpointContextOf("http://localhost:11434/v1")).toEqual({
      endpointHost: "localhost:11434",
    });
  });

  it("drops the path and query, which are not the endpoint's identity", () => {
    expect(endpointContextOf("https://api.example.test/v1/chat?key=abc")).toEqual({
      endpointHost: "api.example.test",
    });
  });

  it("drops user-info, so a credential embedded in the URL can never reach a message", () => {
    expect(endpointContextOf("https://user:sk-secret@api.example.test:8443/v1")).toEqual({
      endpointHost: "api.example.test:8443",
    });
  });

  it("returns undefined for a value that is not a URL at all", () => {
    expect(endpointContextOf("not a url")).toBeUndefined();
  });
});
