import { describe, expect, it } from "vitest";
import { redactKeys } from "./redaction.js";

const SAMPLES_PER_SHAPE = 10_000;

const BASE64URL = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const ALPHANUMERIC = BASE64URL.slice(0, 62);
const LETTERS = BASE64URL.slice(0, 52);

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomRun(next: () => number, alphabet: string, length: number): string {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += alphabet[Math.floor(next() * alphabet.length)];
  }
  return out;
}

const KEY_SHAPES: readonly (readonly [string, (next: () => number) => string])[] = [
  ["an Anthropic API key", (next) => `sk-ant-api03-${randomRun(next, BASE64URL, 93)}AA`],
  ["an Anthropic Admin API key", (next) => `sk-ant-admin01-${randomRun(next, BASE64URL, 93)}AA`],
  ["an OpenAI project key", (next) => `sk-proj-${randomRun(next, BASE64URL, 156)}`],
  ["an OpenAI service-account key", (next) => `sk-svcacct-${randomRun(next, BASE64URL, 156)}`],
  ["an OpenAI admin key", (next) => `sk-admin-${randomRun(next, BASE64URL, 156)}`],
  ["a legacy OpenAI key", (next) => `sk-${randomRun(next, ALPHANUMERIC, 48)}`],
  ["an all-letter legacy OpenAI key", (next) => `sk-${randomRun(next, LETTERS, 48)}`],
];

describe("redactKeys: random real key shapes", () => {
  it.each(KEY_SHAPES)("redacts every sampled %s whole", (_shape, generate) => {
    const next = seededRandom(0x5eed);
    const misses: string[] = [];
    for (let i = 0; i < SAMPLES_PER_SHAPE; i += 1) {
      const key = generate(next);
      if (redactKeys(`failed for ${key}. retry`) !== "failed for [REDACTED]. retry") {
        misses.push(key);
      }
    }
    expect(misses).toEqual([]);
  });
});

const BOUNDARIES_PER_SHAPE = 500;

const BOUNDARY_CONTEXTS: readonly (readonly [string, string, string])[] = [
  ["a percent-encoded equals sign", "q%3D", ""],
  ["a percent-encoded space", "Bearer%20", ""],
  ["a percent-encoded quote", "%22", "%22"],
  ["a percent-encoded key assignment", "api_key%3D", "%26x%3D1"],
  ["an ANSI color sequence", "\x1b[31m", "\x1b[0m"],
  ["an ANSI sequence without parameters", "\x1b[m", ""],
  ["a JSON-escaped ANSI color sequence", "\\u001b[1;31m", "\\u001b[0m"],
  ["an upper-case JSON-escaped ANSI sequence", "\\u001B[31m", ""],
];

describe("redactKeys: real key shapes after an encoded boundary", () => {
  const cases = KEY_SHAPES.flatMap(([shape, generate]) =>
    BOUNDARY_CONTEXTS.map(
      ([where, before, after]) => [shape, where, generate, before, after] as const,
    ),
  );

  it.each(cases)("redacts every sampled %s after %s", (_shape, _where, generate, before, after) => {
    const next = seededRandom(0xb0d);
    const misses: string[] = [];
    for (let i = 0; i < BOUNDARIES_PER_SHAPE; i += 1) {
      const key = generate(next);
      if (redactKeys(`${before}${key}${after}`) !== `${before}[REDACTED]${after}`) {
        misses.push(key);
      }
    }
    expect(misses).toEqual([]);
  });
});

describe("redactKeys: Slovak locale-shaped tokens", () => {
  it.each([
    "sk-SK_formal",
    "locales/sk-SK_formal.json",
    "sk-banner_headline",
    "sk-SK",
    "sk-onboarding_step_2_title",
    "sk-checkout-summary_total_label",
    "sk-admin-panel_title",
    "sk-proj-",
    "sk-ant-x",
    "sk-proj-overview_heading",
    "sk-svcacct-settings",
    "sk-ant-banner_title_short",
    "sk-admin-dashboard_welcome_message",
    "sk-proj-settings_account_billing_title",
    "sk-ant-hero_section_subtitle_text",
    "locales%2Fsk-SK_formal.json",
    "\x1b[32msk-proj-settings_account_billing_title\x1b[0m",
  ])("leaves %s readable", (text) => {
    expect(redactKeys(text)).toBe(text);
  });

  it("redacts a known prefix only once 32 letters and digits follow `sk-`", () => {
    expect(redactKeys("sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1w")).toBe("[REDACTED]");
    expect(redactKeys("sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1")).toBe(
      "sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1",
    );
  });

  it("redacts a camelCase `sk-` key once it reaches 32 letters and digits", () => {
    expect(redactKeys("sk-onboardingWelcomeScreenPrimaryButton")).toBe("[REDACTED]");
  });
});
