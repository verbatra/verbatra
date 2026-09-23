import { redactKeys } from "@verbatra/ai-providers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { baseConfig } from "../test-support.js";
import { declareProviderKeyEnvVar } from "./provider-key-env.js";

const FAKE_KEY = "fake provider key env value";
const NAMES = ["PROVIDER_KEY_ENV_DECLARED"];

describe("declareProviderKeyEnvVar", () => {
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const name of NAMES) {
      saved[name] = process.env[name];
      process.env[name] = FAKE_KEY;
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

  it("declares nothing for a hosted provider", () => {
    declareProviderKeyEnvVar(baseConfig().provider);
    expect(redactKeys(FAKE_KEY)).toBe(FAKE_KEY);
  });

  it("declares nothing for an openai-compatible provider without apiKeyEnvVar", () => {
    declareProviderKeyEnvVar({
      id: "openai-compatible",
      options: { baseUrl: "http://localhost:1/v1", model: "m", maxOutputTokens: 1 },
    });
    expect(redactKeys(FAKE_KEY)).toBe(FAKE_KEY);
  });

  it("declares the variable an openai-compatible provider names", () => {
    declareProviderKeyEnvVar({
      id: "openai-compatible",
      options: {
        baseUrl: "http://localhost:1/v1",
        model: "m",
        maxOutputTokens: 1,
        apiKeyEnvVar: "PROVIDER_KEY_ENV_DECLARED",
      },
    });
    expect(redactKeys(`leak ${FAKE_KEY}`)).toBe("leak [REDACTED]");
  });
});
