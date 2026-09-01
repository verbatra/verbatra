import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { redact } from "./redact.js";

describe("redact", () => {
  it("returns the input unchanged when nothing matches", () => {
    expect(redact("hello world")).toBe("hello world");
  });

  it("redacts an OpenAI-style sk- key", () => {
    expect(redact("key is sk-abcdEFGH12345678 in the log")).toBe("key is [REDACTED] in the log");
  });

  it("does not redact a hyphenated word that merely starts with sk-", () => {
    expect(redact("this is a risk-averse plan")).toBe("this is a risk-averse plan");
  });

  it("redacts a Gemini-style AIza key", () => {
    const key = `AIza${"a".repeat(35)}`;
    expect(redact(`key: ${key}`)).toBe("key: [REDACTED]");
  });

  it("redacts a hex UUID, with or without the :fx suffix", () => {
    const uuid = "123e4567-e89b-12d3-a456-426614174000";
    expect(redact(`id ${uuid}`)).toBe("id [REDACTED]");
    expect(redact(`id ${uuid}:fx`)).toBe("id [REDACTED]");
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
