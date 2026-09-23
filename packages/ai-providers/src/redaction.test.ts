import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { declareKeyEnvVar } from "./key-env-vars.js";
import { redact, redactKeys } from "./redaction.js";

describe("redact", () => {
  it("removes OpenAI sk- key tokens", () => {
    const out = redact("token sk-ABCDEFGH1234567890 here");
    expect(out).not.toContain("sk-ABCDEFGH");
    expect(out).toContain("[REDACTED]");
  });

  it("removes OpenAI sk-proj- key tokens", () => {
    const out = redact("token sk-proj-ABCDEFGH1234 here");
    expect(out).not.toContain("sk-proj");
    expect(out).toContain("[REDACTED]");
  });

  it("removes Anthropic sk-ant- key tokens", () => {
    const out = redact("auth failed for sk-ant-api03-ABCdef12345_-XYZ in request");
    expect(out).not.toContain("sk-ant-api03");
    expect(out).toContain("[REDACTED]");
  });

  it("removes Gemini AIza key tokens (39 chars total)", () => {
    const key = "AIzaabcdefghijklmnopqrstuvwxyz012345678";
    expect(key).toHaveLength(39);
    const out = redact(`key ${key} trailing`);
    expect(out).not.toContain("AIza");
    expect(out).toContain("[REDACTED]");
  });

  it("removes DeepL UUID key tokens", () => {
    const key = "12345678-1234-1234-1234-123456789012";
    const out = redact(`auth ${key} end`);
    expect(out).not.toContain(key);
    expect(out).toContain("[REDACTED]");
  });

  it("removes DeepL UUID key tokens with the :fx free-tier suffix", () => {
    const key = "abcdef12-3456-7890-abcd-ef1234567890:fx";
    const out = redact(`auth ${key} end`);
    expect(out).not.toContain(key);
    expect(out).not.toContain(":fx");
    expect(out).toContain("[REDACTED]");
  });

  it("removes the exact known secret even when it is not key-shaped", () => {
    const out = redact("header x-token: hunter2hunter2", "hunter2hunter2");
    expect(out).not.toContain("hunter2hunter2");
    expect(out).toContain("[REDACTED]");
  });

  it("leaves text without secrets untouched", () => {
    expect(redact("a plain message", undefined)).toBe("a plain message");
  });

  it("does not over-redact ordinary prose or wrong-length hex runs", () => {
    const input = "a well-known state-of-the-art plan with id 12345678-1234-1234-1234-12345";
    expect(redact(input, undefined)).toBe(input);
  });

  it("does not redact `sk-` runs that sit mid-word (no word boundary)", () => {
    for (const word of ["risk-assessment", "task-management", "desk-organizer", "ask-question"]) {
      expect(redact(word, undefined)).toBe(word);
    }
  });

  it("redacts a genuine sk-ant key sitting at a word boundary", () => {
    const out = redact("auth failed for sk-ant-api03-ABCdef12345_-XYZ", undefined);
    expect(out).not.toContain("sk-ant-api03");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts an inline key after punctuation (punctuation is a word boundary)", () => {
    const out = redact("key=sk-proj-ABCDEFGH1234 here", undefined);
    expect(out).not.toContain("sk-proj");
    expect(out).toContain("[REDACTED]");
  });

  it("uses the environment key as the default secret", () => {
    const saved = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = "topsecretvalue";
    try {
      expect(redact("leak topsecretvalue here")).not.toContain("topsecretvalue");
    } finally {
      if (saved === undefined) {
        delete process.env.ANTHROPIC_API_KEY;
      } else {
        process.env.ANTHROPIC_API_KEY = saved;
      }
    }
  });

  it("returns promptly on a long pathological near-miss input (ReDoS-safe)", () => {
    const nearMiss = `${"abcdef0123456789".repeat(8000)} sk ${"AIz".repeat(8000)}`;
    const start = Date.now();
    const out = redact(nearMiss, undefined);
    expect(Date.now() - start).toBeLessThan(1000);
    expect(out).toBe(nearMiss);
  });
});

describe("redactKeys", () => {
  const NAMES = ["REDACT_KEYS_CUSTOM", "OPENAI_COMPATIBLE_API_KEY"];
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of NAMES) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const name of NAMES) {
      const value = saved[name];
      if (value === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = value;
      }
    }
  });

  it("scrubs key shapes even with no key variable set", () => {
    expect(redactKeys("token sk-ABCDEFGH1234567890 here")).toBe("token [REDACTED] here");
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
});
