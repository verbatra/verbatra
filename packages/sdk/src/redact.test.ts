import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { loadConfigWithMeta } from "./config/load-config.js";
import { redact } from "./redact.js";

const SK_PROJ = ["sk", "proj", ""].join("-");

describe("redact", () => {
  it("returns the input unchanged when nothing matches", () => {
    expect(redact("hello world")).toBe("hello world");
  });

  it("redacts an OpenAI-style sk- key", () => {
    expect(redact(`key is ${SK_PROJ}Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z in the log`)).toBe(
      "key is [REDACTED] in the log",
    );
  });

  it("redacts a key after a newline in serialized JSON and keeps the JSON valid", () => {
    const key = `${SK_PROJ}Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zAb3dEf6h`;

    const out = redact(JSON.stringify({ error: `line\n${key}` }));

    expect(JSON.parse(out)).toEqual({ error: "line\n[REDACTED]" });
  });

  it("leaves a known prefix with no key after it readable", () => {
    expect(redact("sk-admin-panel_title")).toBe("sk-admin-panel_title");
  });

  it("does not redact a hyphenated word that merely starts with sk-", () => {
    expect(redact("this is a risk-averse plan")).toBe("this is a risk-averse plan");
  });

  it("redacts a Gemini-style AIza key", () => {
    const key = `AIza${"a".repeat(35)}`;
    expect(redact(`key: ${key}`)).toBe("key: [REDACTED]");
  });

  it("redacts a DeepL free key by its :fx suffix and a Pro key in a key context", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    expect(redact(`id ${uuid}:fx`)).toBe("id [REDACTED]");
    expect(redact(`DeepL-Auth-Key ${uuid}`)).toBe("DeepL-Auth-Key [REDACTED]");
  });

  it("leaves a UUID in a path or an id readable", () => {
    const path = "/tmp/3f2a1c9e-8b7d-4e6f-9a0b-1c2d3e4f5a6b/locales/de.json";
    expect(redact(`Could not write ${path}`)).toBe(`Could not write ${path}`);
  });

  describe("exact provider env value scrub", () => {
    const originalValues: Record<string, string | undefined> = {};
    const envVarNames = [
      "ANTHROPIC_API_KEY",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
      "DEEPL_API_KEY",
      "GOOGLE_TRANSLATE_API_KEY",
      "OPENAI_COMPATIBLE_API_KEY",
    ];

    beforeEach(() => {
      for (const name of envVarNames) {
        originalValues[name] = process.env[name];
      }
    });

    afterEach(() => {
      for (const name of envVarNames) {
        const value = originalValues[name];
        if (value === undefined) {
          delete process.env[name];
        } else {
          process.env[name] = value;
        }
      }
    });

    it.each(envVarNames)("scrubs the exact configured value of %s", (name) => {
      const sentinel = `plain-value-for-${name}`;
      process.env[name] = sentinel;

      expect(redact(`leaked ${sentinel} here`)).toBe("leaked [REDACTED] here");
    });

    it("leaves text alone when no provider env var is set", () => {
      for (const name of envVarNames) {
        delete process.env[name];
      }

      expect(redact("nothing configured here")).toBe("nothing configured here");
    });

    it("does not scrub an empty env var value", () => {
      process.env.ANTHROPIC_API_KEY = "";

      expect(redact("still plain text")).toBe("still plain text");
    });
  });
});

describe("redact: a key read through a custom apiKeyEnvVar", () => {
  const savedValues: Record<string, string | undefined> = {};
  const names = ["SDK_REDACT_LOADED_KEY", "SDK_REDACT_SUMMARY_KEY", "SDK_REDACT_UNDECLARED_KEY"];

  beforeEach(() => {
    for (const name of names) {
      savedValues[name] = process.env[name];
    }
  });

  afterEach(() => {
    for (const name of names) {
      const value = savedValues[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  function openAiCompatibleConfig(apiKeyEnvVar: string): unknown {
    return {
      sourceLocale: "en",
      targetLocales: ["de"],
      format: "i18next-json",
      files: { pattern: "locales/{locale}.json" },
      provider: {
        id: "openai-compatible",
        options: {
          baseUrl: "http://localhost:11434/v1",
          model: "m",
          maxOutputTokens: 256,
          apiKeyEnvVar,
        },
      },
    };
  }

  it("leaves an undeclared variable's unshaped value alone", () => {
    process.env.SDK_REDACT_UNDECLARED_KEY = "fake undeclared key value";
    expect(redact("value fake undeclared key value here")).toBe(
      "value fake undeclared key value here",
    );
  });

  it("scrubs the value once a config naming the variable is loaded", async () => {
    process.env.SDK_REDACT_LOADED_KEY = "fake loaded key value";
    await loadConfigWithMeta({ configOverride: openAiCompatibleConfig("SDK_REDACT_LOADED_KEY") });

    const out = redact("glossary fake loaded key value, error: fake loaded key value");

    expect(out).toBe("glossary [REDACTED], error: [REDACTED]");
  });

  it("scrubs the value inside a serialized run summary", async () => {
    process.env.SDK_REDACT_SUMMARY_KEY = "fake summary key value";
    await loadConfigWithMeta({ configOverride: openAiCompatibleConfig("SDK_REDACT_SUMMARY_KEY") });

    const summary = JSON.stringify({
      failed: [{ locale: "de", message: "boom fake summary key value" }],
    });

    expect(redact(summary)).not.toContain("fake summary key value");
  });
});
