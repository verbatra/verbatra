import { cpuScalingRatio, LINEAR_MAX_RATIO, LINEAR_SCALE } from "@verbatra/config/scaling";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { declareKeyEnvVar, OPENAI_COMPATIBLE_ENV_VAR, PROVIDER_ENV } from "./key-env-vars.js";
import { redactKeys } from "./redaction.js";
import { resetDeclaredKeyEnvVars } from "./test-support.js";

describe("redactKeys: key shapes", () => {
  it("removes OpenAI sk- key tokens", () => {
    const out = redactKeys("token sk-ABCDEFGH1234567890abcdefghIJKLMNOP1234567890ab here");
    expect(out).not.toContain("sk-ABCDEFGH");
    expect(out).toContain("[REDACTED]");
  });

  it("removes OpenAI sk-proj- key tokens", () => {
    const out = redactKeys("token sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z_Ab3dEf6hIj9k here");
    expect(out).not.toContain("sk-proj");
    expect(out).toContain("[REDACTED]");
  });

  it("removes Anthropic sk-ant- key tokens", () => {
    const out = redactKeys(
      "auth failed for sk-ant-api03-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z-AbCd_Ef6h in request",
    );
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

  it.each([
    [
      "an Authorization header",
      "Authorization: DeepL-Auth-Key {key}",
      "Authorization: DeepL-Auth-Key [REDACTED]",
    ],
    [
      "a form parameter",
      "POST /v2/translate auth_key={key}&text=hi",
      "POST /v2/translate auth_key=[REDACTED]&text=hi",
    ],
    ["an env assignment", "DEEPL_API_KEY={key}", "DEEPL_API_KEY=[REDACTED]"],
    ["a quoted JSON field", '{"auth_key": "{key}"}', '{"auth_key": "[REDACTED]"}'],
    ["a YAML-style field", "deepl_api_key: {key}", "deepl_api_key: [REDACTED]"],
    [
      "a JSON field serialized inside a JSON string",
      '{\\"auth_key\\": \\"{key}\\"}',
      '{\\"auth_key\\": \\"[REDACTED]\\"}',
    ],
    ["a DEEPL_AUTH_KEY assignment", "DEEPL_AUTH_KEY={key}", "DEEPL_AUTH_KEY=[REDACTED]"],
    ["a camelCase authKey field", 'authKey: "{key}"', 'authKey: "[REDACTED]"'],
    ["a quoted deeplKey field", '"deeplKey": "{key}"', '"deeplKey": "[REDACTED]"'],
    ["a header written without whitespace", "DeepL-Auth-Key:{key}", "DeepL-Auth-Key:[REDACTED]"],
    ["a command-line flag", "--auth-key {key} --verbose", "--auth-key [REDACTED] --verbose"],
    [
      "a URL-encoded form parameter",
      "body=auth_key%3D{key}%26text%3Dhi",
      "body=auth_key%3D[REDACTED]%26text%3Dhi",
    ],
  ])("removes a DeepL Pro key (a bare UUID) that sits in %s", (_where, template, expected) => {
    const key = "12345678-1234-1234-1234-123456789012";
    expect(redactKeys(template.replace("{key}", key))).toBe(expected);
  });

  it("removes a free key with its :fx suffix in a key context, leaving no suffix behind", () => {
    const key = "abcdef12-3456-7890-abcd-ef1234567890:fx";
    expect(redactKeys(`DeepL-Auth-Key ${key}`)).toBe("DeepL-Auth-Key [REDACTED]");
  });

  it.each([
    "/tmp/3f2a1c9e-8b7d-4e6f-9a0b-1c2d3e4f5a6b/locales/de.json",
    "request 123e4567-e89b-12d3-a456-426614174000 failed",
    "auth 12345678-1234-1234-1234-123456789012 end",
    "C:\\work\\3F2A1C9E-8B7D-4E6F-9A0B-1C2D3E4F5A6B\\de.json",
  ])("leaves an unrelated bare UUID alone: %s", (text) => {
    expect(redactKeys(text)).toBe(text);
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

  it.each([
    "locales/sk-SK_formal.json",
    '{"key":"sk-banner_headline"}',
    "sk-SK",
    "sk-onboarding_step_2_title",
  ])("leaves a Slovak locale path or key alone: %s", (text) => {
    expect(redactKeys(text)).toBe(text);
  });

  it.each([
    ["a legacy OpenAI key", "sk-ABCDEFGH1234567890abcdefghIJKLMNOP1234567890ab"],
    ["an OpenAI project key", "sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z_Ab3dEf6hIj9k-Lm2nOp"],
    ["an OpenAI service-account key", "sk-svcacct-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z"],
    ["an Anthropic key", "sk-ant-api03-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z-AbCd_Ef6hIj9kLm2n-AA"],
  ])("redacts %s whole", (_what, key) => {
    expect(redactKeys(`failed for ${key}.`)).toBe("failed for [REDACTED].");
  });

  it("does not redact `sk-` runs that sit mid-word (no word boundary)", () => {
    for (const word of ["risk-assessment", "task-management", "desk-organizer", "ask-question"]) {
      expect(redactKeys(word)).toBe(word);
    }
  });

  it.each([
    ["a newline", "line\n"],
    ["a tab", "cell\t"],
    ["a carriage return", "row\r"],
    ["a form feed", "page\f"],
    ["a backspace", "back\b"],
    ["a control character escaped as \\u", "bell\u0007"],
    ["a quote", 'say "'],
  ])("redacts a key after %s once the text is serialized as JSON", (_what, before) => {
    const key = "sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zAb3dEf6h";
    const serialized = JSON.stringify({ message: `${before}${key} failed` });

    const out = redactKeys(serialized);

    expect(out).not.toContain(key);
    expect(JSON.parse(out)).toEqual({ message: `${before}[REDACTED] failed` });
  });

  it.each(["prefix_", "cache.", "path/", "é"])(
    "redacts a key right after %s, which is not a letter or digit",
    (before) => {
      const key = "sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zAb3dEf6h";
      expect(redactKeys(`${before}${key}`)).toBe(`${before}[REDACTED]`);
    },
  );

  it.each([
    ["a percent-encoded equals sign", "q%3D"],
    ["a percent-encoded space", "Bearer%20"],
    ["a percent-encoded quote", "%22"],
    ["a percent-encoded key assignment", "key%3D"],
    ["an ANSI color sequence", "\x1b[31m"],
    ["an ANSI erase-line sequence", "\x1b[2K"],
    ["an ANSI cursor sequence", "\x1b[1G"],
    ["an ANSI private-mode sequence", "\x1b[?25h"],
    ["an ANSI charset designation", "\x1b(B"],
  ])("redacts a key right after %s", (_what, before) => {
    for (const key of [
      "sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zAb3dEf6h",
      "sk-ant-api03-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z-AbCd_Ef6hIj9kLm2n-AA",
      "sk-ABCDEFGH1234567890abcdefghIJKLMNOP1234567890ab",
    ]) {
      expect(redactKeys(`${before}${key} end`)).toBe(`${before}[REDACTED] end`);
    }
  });

  it("redacts a key after an ANSI color sequence once the text is serialized as JSON", () => {
    const key = "sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4zAb3dEf6h";
    const serialized = JSON.stringify({ message: `\x1b[1;31m${key}\x1b[0m failed` });

    const out = redactKeys(serialized);

    expect(out).not.toContain(key);
    expect(JSON.parse(out)).toEqual({ message: "\x1b[1;31m[REDACTED]\x1b[0m failed" });
  });

  it("returns promptly on long ANSI and percent-encoded near-miss runs (ReDoS-safe)", () => {
    const nearMissOf = (n: number) => `\x1b[${"1;".repeat(n)}m sk %3D${"%20".repeat(n)}m`;
    const nearMiss = nearMissOf(20000 * LINEAR_SCALE);
    expect(redactKeys(nearMiss)).toBe(nearMiss);
    expect(cpuScalingRatio(redactKeys, nearMissOf(20000), nearMiss)).toBeLessThan(LINEAR_MAX_RATIO);
  });

  it("redacts a genuine sk-ant key sitting at a word boundary", () => {
    const out = redactKeys("auth failed for sk-ant-api03-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z");
    expect(out).not.toContain("sk-ant-api03");
    expect(out).toContain("[REDACTED]");
  });

  it("redacts an inline key after punctuation (punctuation is a word boundary)", () => {
    const out = redactKeys("key=sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z here");
    expect(out).not.toContain("sk-proj");
    expect(out).toContain("[REDACTED]");
  });

  it("returns promptly on a long pathological near-miss input (ReDoS-safe)", () => {
    const nearMissOf = (n: number) => `${"abcdef0123456789".repeat(n)} sk ${"AIz".repeat(n)}`;
    const nearMiss = nearMissOf(8000 * LINEAR_SCALE);
    expect(redactKeys(nearMiss)).toBe(nearMiss);
    expect(cpuScalingRatio(redactKeys, nearMissOf(8000), nearMiss)).toBeLessThan(LINEAR_MAX_RATIO);
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

  it.each([
    ["a double quote", 'fake-"quoted"-key'],
    ["a backslash", "fake\\back\\slash-key"],
    ["a trailing backslash", "fake-trailing-key\\"],
  ])("scrubs a value holding %s from serialized JSON and keeps it parseable", (_what, value) => {
    process.env.ANTHROPIC_API_KEY = value;
    const serialized = JSON.stringify({ message: `rejected ${value}`, path: `/p/${value}` });

    const out = redactKeys(serialized);

    expect(JSON.parse(out)).toEqual({ message: "rejected [REDACTED]", path: "/p/[REDACTED]" });
  });

  it("follows a key value that changes between calls", () => {
    process.env.ANTHROPIC_API_KEY = "fake-first-value";
    expect(redactKeys("a fake-first-value")).toBe("a [REDACTED]");
    expect(redactKeys("b fake-first-value")).toBe("b [REDACTED]");

    process.env.ANTHROPIC_API_KEY = "fake-second-value";

    expect(redactKeys("a fake-first-value fake-second-value")).toBe(
      "a fake-first-value [REDACTED]",
    );
    delete process.env.ANTHROPIC_API_KEY;
    expect(redactKeys("a fake-second-value")).toBe("a fake-second-value");
  });

  it("drops the cached value pattern once every key variable is unset", () => {
    const NativeRegExp = RegExp;
    let constructed = 0;
    globalThis.RegExp = new Proxy(NativeRegExp, {
      construct(target, args: [string, string]) {
        constructed += 1;
        return Reflect.construct(target, args);
      },
    });
    try {
      process.env.ANTHROPIC_API_KEY = "fake-cached-value";
      redactKeys("a fake-cached-value");
      delete process.env.ANTHROPIC_API_KEY;
      redactKeys("b");
      process.env.ANTHROPIC_API_KEY = "fake-cached-value";
      expect(redactKeys("c fake-cached-value")).toBe("c [REDACTED]");
    } finally {
      globalThis.RegExp = NativeRegExp;
    }
    expect(constructed).toBe(2);
  });

  it("treats regular-expression metacharacters in a value literally", () => {
    process.env.ANTHROPIC_API_KEY = "fake.key+(value)";
    expect(redactKeys("x fake.key+(value) fakeXkeyy(value)")).toBe("x [REDACTED] fakeXkeyy(value)");
  });
});
