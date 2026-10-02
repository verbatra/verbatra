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

  it("leaves a short sk- key name and an unrelated UUID alone", () => {
    expect(findKeyShapes(`sk-SK and /orders/${UUID}`)).toEqual([]);
  });
});
