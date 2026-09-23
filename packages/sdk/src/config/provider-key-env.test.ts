import { redactKeys } from "@verbatra/ai-providers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { baseConfig } from "../test-support.js";
import { declareProviderKeyEnvVar } from "./provider-key-env.js";

const NAME = "PROVIDER_KEY_ENV_DECLARED";
const FAKE_KEY = "fake provider key env value";

function declaredCount(): number {
  const registry = (globalThis as unknown as Record<symbol, Set<string> | undefined>)[
    Symbol.for("verbatra.keyEnvVars.v1")
  ];
  return registry?.size ?? 0;
}

describe("declareProviderKeyEnvVar", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env[NAME];
    process.env[NAME] = FAKE_KEY;
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env[NAME];
    } else {
      process.env[NAME] = saved;
    }
  });

  it("declares nothing for a hosted provider", () => {
    const before = declaredCount();
    declareProviderKeyEnvVar(baseConfig().provider);
    expect(declaredCount()).toBe(before);
  });

  it("declares nothing for an openai-compatible provider without apiKeyEnvVar", () => {
    const before = declaredCount();
    declareProviderKeyEnvVar({
      id: "openai-compatible",
      options: { baseUrl: "http://localhost:1/v1", model: "m", maxOutputTokens: 1 },
    });
    expect(declaredCount()).toBe(before);
  });

  it("declares the variable an openai-compatible provider names", () => {
    declareProviderKeyEnvVar({
      id: "openai-compatible",
      options: {
        baseUrl: "http://localhost:1/v1",
        model: "m",
        maxOutputTokens: 1,
        apiKeyEnvVar: NAME,
      },
    });
    expect(redactKeys(`leak ${FAKE_KEY}`)).toBe("leak [REDACTED]");
  });
});
