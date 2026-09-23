import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { declareKeyEnvVar, OPENAI_COMPATIBLE_ENV_VAR, PROVIDER_ENV } from "./key-env-vars.js";
import { redactKeys } from "./redaction.js";
import { resetDeclaredKeyEnvVars } from "./test-support.js";

describe("redactKeys: key shapes", () => {
  it("removes OpenAI sk- key tokens", () => {
    const out = redactKeys("token sk-ABCDEFGH1234567890 here");
    expect(out).not.toContain("sk-ABCDEFGH");
    expect(out).toContain("[REDACTED]");
  });

  it("removes OpenAI sk-proj- key tokens", () => {
    const out = redactKeys("token sk-proj-ABCDEFGH1234 here");
    expect(out).not.toContain("sk-proj");
    expect(out).toContain("[REDACTED]");
  });

  it("removes Anthropic sk-ant- key tokens", () => {
    const out = redactKeys("auth failed for sk-ant-api03-ABCdef12345_-XYZ in request");
    expect(out).not.toContain("sk-ant-api03");
    expect(out).toContain("[REDACTED]");
  });

  it("removes Gemini AIza key tokens (39 chars total)", () => {
    const key = "AIzaabcdefghijklmnopqrstuvwxyz012345678";
    expect(key).toHaveLength(39);
    const out = redactKeys(`key ${key} trailing`);
    expect(out).not.toContain("AIza");
    expect(out).toContain("[REDACTED]");
  });

  it("removes DeepL UUID key tokens", () => {
    const key = "12345678-1234-1234-1234-123456789012";
    const out = redactKeys(`auth ${key} end`);
    expect(out).not.toContain(key);
    expect(out).toContain("[REDACTED]");
  });

  it("removes DeepL UUID key tokens with the :fx free-tier suffix", () => {
    const key = "abcdef12-3456-7890-abcd-ef1234567890:fx";
    const out = redactKeys(`auth ${key} end`);
    expect(out).not.toContain(key);
    expect(out).not.toContain(":fx");
    expect(out).toContain("[REDACTED]");
  });

  it("leaves text without secrets untouched", () => {
    expect(redactKeys("a plain message")).toBe("a plain message");
  });

  it("does not over-redact ordinary prose or wrong-length hex runs", () => {
    const input = "a well-known state-of-the-art plan with id 12345678-1234-1234-1234-12345";
    expect(redactKeys(input)).toBe(input);
  });

  it("does not redact `sk-` runs that sit mid-word (no word boundary)", () => {
    for (const word of ["risk-assessment", "task-management", "desk-organizer", "ask-question"]) {
      expect(redactKeys(word)).toBe(word);
    }
  });

  it("redacts a genuine sk-ant key sitting at a word boundary", () => {
    const out = redactKeys("auth failed for sk-ant-api03-ABCdef12345_-XYZ");
    expect(out).not.toContain("sk-ant-api03");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts an inline key after punctuation (punctuation is a word boundary)", () => {
    const out = redactKeys("key=sk-proj-ABCDEFGH1234 here");
    expect(out).not.toContain("sk-proj");
    expect(out).toContain("[REDACTED]");
  });

  it("returns promptly on a long pathological near-miss input (ReDoS-safe)", () => {
    const nearMiss = `${"abcdef0123456789".repeat(8000)} sk ${"AIz".repeat(8000)}`;
    const start = Date.now();
    const out = redactKeys(nearMiss);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(out).toBe(nearMiss);
  });
});

describe("redactKeys: exact key values", () => {
  const BUILT_IN_NAMES = [...Object.values(PROVIDER_ENV), OPENAI_COMPATIBLE_ENV_VAR];
  const NAMES = [...BUILT_IN_NAMES, "REDACT_KEYS_CUSTOM", "REDACT_KEYS_OTHER"];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    resetDeclaredKeyEnvVars();
    for (const name of NAMES) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    resetDeclaredKeyEnvVars();
    for (const name of NAMES) {
      const value = saved[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it.each(BUILT_IN_NAMES)("scrubs the exact value of the built-in %s", (name) => {
    process.env[name] = "fake-builtin-value";
    expect(redactKeys("leak fake-builtin-value here")).toBe("leak [REDACTED] here");
  });

  it("leaves text untouched when nothing is configured", () => {
    expect(redactKeys("a plain message")).toBe("a plain message");
  });

  it("leaves the value of an undeclared variable alone", () => {
    process.env.REDACT_KEYS_CUSTOM = "fake-undeclared-value";
    expect(redactKeys("x fake-undeclared-value")).toBe("x fake-undeclared-value");
  });

  it("scrubs the value of a declared variable", () => {
    declareKeyEnvVar("REDACT_KEYS_CUSTOM");
    process.env.REDACT_KEYS_CUSTOM = "fake-declared-value";
    expect(redactKeys("x fake-declared-value y")).toBe("x [REDACTED] y");
  });

  it("ignores a value shorter than eight characters so it never wipes unrelated text", () => {
    declareKeyEnvVar("REDACT_KEYS_CUSTOM");
    process.env.REDACT_KEYS_CUSTOM = "mario";
    expect(redactKeys("mario wrote the marionette docs")).toBe("mario wrote the marionette docs");
  });

  it("scrubs a value of exactly eight characters", () => {
    declareKeyEnvVar("REDACT_KEYS_CUSTOM");
    process.env.REDACT_KEYS_CUSTOM = "abcd1234";
    expect(redactKeys("k=abcd1234")).toBe("k=[REDACTED]");
  });

  it("ignores an empty value", () => {
    process.env.ANTHROPIC_API_KEY = "";
    expect(redactKeys("still plain text")).toBe("still plain text");
  });

  it("scrubs a whole value that embeds a key shape, leaving no fragment behind", () => {
    process.env.OPENAI_COMPATIBLE_API_KEY = "prefix-sk-ABCDEFGH12345678";
    expect(redactKeys("k=prefix-sk-ABCDEFGH12345678")).toBe("k=[REDACTED]");
  });

  it("scrubs the longer of two overlapping values whole", () => {
    declareKeyEnvVar("REDACT_KEYS_CUSTOM");
    process.env.OPENAI_COMPATIBLE_API_KEY = "fake-short";
    process.env.REDACT_KEYS_CUSTOM = "fake-short-and-longer";
    expect(redactKeys("a fake-short-and-longer b fake-short")).toBe("a [REDACTED] b [REDACTED]");
  });

  it("never rescans its own marker when a value spells part of it", () => {
    declareKeyEnvVar("REDACT_KEYS_CUSTOM");
    declareKeyEnvVar("REDACT_KEYS_OTHER");
    process.env.REDACT_KEYS_CUSTOM = "fake-first-value";
    process.env.REDACT_KEYS_OTHER = "REDACTED";
    expect(redactKeys("a fake-first-value b REDACTED")).toBe("a [REDACTED] b [REDACTED]");
  });

  it("treats regular-expression metacharacters in a value literally", () => {
    process.env.ANTHROPIC_API_KEY = "fake.key+(value)";
    expect(redactKeys("x fake.key+(value) fakeXkeyy(value)")).toBe("x [REDACTED] fakeXkeyy(value)");
  });
});
