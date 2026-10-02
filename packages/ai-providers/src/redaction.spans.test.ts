import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PROVIDER_ENV } from "./key-env-vars.js";
import { findKeyShapes, redactKeys } from "./redaction.js";

const SK = "sk-proj-Ab3dEf6hIj9kLm2nOp5qRs8tUv1wXy4z";
const AIZA = `AIza${"B".repeat(35)}`;
const UUID = "0f1e2d3c-4b5a-6978-8a9b-0c1d2e3f4a5b";

function spanTexts(text: string): string[] {
  return findKeyShapes(text).map((span) => text.slice(span.start, span.end));
}

describe("findKeyShapes", () => {
  const saved = process.env[PROVIDER_ENV.openai];

  beforeEach(() => {
    delete process.env[PROVIDER_ENV.openai];
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env[PROVIDER_ENV.openai];
    } else {
      process.env[PROVIDER_ENV.openai] = saved;
    }
  });

  it("finds exactly what redactKeys replaces", () => {
    const text = `a ${SK} b ${AIZA} c ${UUID}:fx d api_key=${UUID} e`;

    expect(spanTexts(text).sort()).toEqual([SK, AIZA, `${UUID}:fx`, UUID].sort());
    expect(redactKeys(text)).not.toContain(UUID);
  });

  it("finds a configured key value by its exact text", () => {
    process.env[PROVIDER_ENV.openai] = "plain-secret-value";

    expect(spanTexts("token plain-secret-value here")).toEqual(["plain-secret-value"]);
  });

  it.each([
    ["a GitHub token", `ghp_${"a1".repeat(18)}`],
    ["a fine-grained GitHub token", `github_pat_${"A1_b".repeat(10)}`],
    ["a Stripe secret key", `sk_live_${"x9".repeat(12)}`],
    ["a Stripe restricted key", `rk_live_${"x9".repeat(12)}`],
    ["a Slack token", "xoxb-1234567890-abcdefghij"],
  ])("finds and redacts %s", (_name, token) => {
    const text = `use ${token} now`;

    expect(spanTexts(text)).toEqual([token]);
    expect(redactKeys(text)).toBe("use [REDACTED] now");
  });

  it.each(["ghp_short", "sk_live_short", "xoxb-short", "github_pat_short"])(
    "leaves the short look-alike %s alone",
    (text) => {
      expect(findKeyShapes(text)).toEqual([]);
    },
  );

  it("leaves a short sk- key name and an unrelated UUID alone", () => {
    expect(findKeyShapes(`sk-SK and /orders/${UUID}`)).toEqual([]);
  });
});
