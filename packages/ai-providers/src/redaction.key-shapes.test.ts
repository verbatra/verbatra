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
  ])("leaves %s readable", (text) => {
    expect(redactKeys(text)).toBe(text);
  });

  it("redacts a known prefix once 20 letters and digits follow it", () => {
    expect(redactKeys("sk-proj-Ab3dEf6hIj9kLm2nOp5q")).toBe("[REDACTED]");
    expect(redactKeys("sk-proj-Ab3dEf6hIj9kLm2nOp5")).toBe("sk-proj-Ab3dEf6hIj9kLm2nOp5");
  });

  it("redacts a camelCase `sk-` key once it reaches 32 letters and digits", () => {
    expect(redactKeys("sk-onboardingWelcomeScreenPrimaryButton")).toBe("[REDACTED]");
  });
});
