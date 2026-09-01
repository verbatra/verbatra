import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  OPENAI_COMPATIBLE_ENV_VAR,
  OPENAI_COMPATIBLE_KEY_PLACEHOLDER,
  PROVIDER_ENV,
  requireAnthropicKey,
  requireGoogleTranslateKey,
  resolveOpenAiCompatibleKey,
} from "./env.js";
import { ProviderError } from "./errors.js";

describe("PROVIDER_ENV", () => {
  it("maps every provider id to its canonical environment variable name", () => {
    expect(PROVIDER_ENV).toEqual({
      anthropic: "ANTHROPIC_API_KEY",
      openai: "OPENAI_API_KEY",
      gemini: "GEMINI_API_KEY",
      deepl: "DEEPL_API_KEY",
      "google-translate": "GOOGLE_TRANSLATE_API_KEY",
    });
  });

  it("covers exactly the five v1 providers", () => {
    expect(Object.keys(PROVIDER_ENV).sort()).toEqual([
      "anthropic",
      "deepl",
      "gemini",
      "google-translate",
      "openai",
    ]);
  });
});

describe("requireGoogleTranslateKey", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.GOOGLE_TRANSLATE_API_KEY;
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env.GOOGLE_TRANSLATE_API_KEY;
    } else {
      process.env.GOOGLE_TRANSLATE_API_KEY = saved;
    }
  });

  it("returns the key when the environment variable is set", () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = `AIza${"a".repeat(35)}`;
    expect(requireGoogleTranslateKey()).toBe(`AIza${"a".repeat(35)}`);
  });

  it("throws a structured, key-free error when the variable is missing", () => {
    delete process.env.GOOGLE_TRANSLATE_API_KEY;
    try {
      requireGoogleTranslateKey();
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).code).toBe("MISSING_API_KEY");
      expect((error as ProviderError).message).toContain("GOOGLE_TRANSLATE_API_KEY");
      expect((error as ProviderError).message).not.toContain("AIza");
    }
  });

  it("treats an empty key as missing", () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = "";
    expect(() => requireGoogleTranslateKey()).toThrow(ProviderError);
  });
});

describe("requireAnthropicKey", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it("returns the key when the environment variable is set", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test-key";
    expect(requireAnthropicKey()).toBe("sk-ant-test-key");
  });

  it("throws a structured, key-free error when the variable is missing", () => {
    delete process.env.ANTHROPIC_API_KEY;
    try {
      requireAnthropicKey();
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).code).toBe("MISSING_API_KEY");
      expect((error as ProviderError).message).not.toContain("sk-");
    }
  });

  it("treats an empty key as missing", () => {
    process.env.ANTHROPIC_API_KEY = "";
    expect(() => requireAnthropicKey()).toThrow(ProviderError);
  });
});

describe("resolveOpenAiCompatibleKey", () => {
  const saved: Record<string, string | undefined> = {};
  const envVars = ["OPENAI_COMPATIBLE_API_KEY", "OPENAI_API_KEY", "MY_CUSTOM_LOCAL_KEY"] as const;

  beforeEach(() => {
    for (const name of envVars) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of envVars) {
      const value = saved[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it("falls back to the local placeholder when nothing is configured", () => {
    expect(resolveOpenAiCompatibleKey()).toBe(OPENAI_COMPATIBLE_KEY_PLACEHOLDER);
    expect(OPENAI_COMPATIBLE_KEY_PLACEHOLDER).toBe("local");
  });

  it("uses the OPENAI_COMPATIBLE_API_KEY convention variable when set and no apiKeyEnvVar is given", () => {
    process.env[OPENAI_COMPATIBLE_ENV_VAR] = "conv-key-123";
    expect(resolveOpenAiCompatibleKey()).toBe("conv-key-123");
  });

  it("silently falls through to the placeholder when the convention variable is empty", () => {
    process.env[OPENAI_COMPATIBLE_ENV_VAR] = "";
    expect(resolveOpenAiCompatibleKey()).toBe(OPENAI_COMPATIBLE_KEY_PLACEHOLDER);
  });

  it("reads a named apiKeyEnvVar when given, ignoring the convention variable", () => {
    process.env.OPENAI_COMPATIBLE_API_KEY = "convention-value";
    process.env.MY_CUSTOM_LOCAL_KEY = "named-value";
    expect(resolveOpenAiCompatibleKey("MY_CUSTOM_LOCAL_KEY")).toBe("named-value");
  });

  it("throws a key-free MISSING_API_KEY naming the variable when the named variable is unset", () => {
    try {
      resolveOpenAiCompatibleKey("MY_CUSTOM_LOCAL_KEY");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).code).toBe("MISSING_API_KEY");
      expect((error as ProviderError).message).toContain("MY_CUSTOM_LOCAL_KEY");
    }
  });

  it("throws MISSING_API_KEY when the named variable is set but empty (no silent fallback)", () => {
    process.env.MY_CUSTOM_LOCAL_KEY = "";
    expect(() => resolveOpenAiCompatibleKey("MY_CUSTOM_LOCAL_KEY")).toThrow(ProviderError);
  });

  it("never reads OPENAI_API_KEY at any tier", () => {
    process.env.OPENAI_API_KEY = "hosted-key-should-never-be-used";
    expect(resolveOpenAiCompatibleKey()).toBe(OPENAI_COMPATIBLE_KEY_PLACEHOLDER);
  });
});
