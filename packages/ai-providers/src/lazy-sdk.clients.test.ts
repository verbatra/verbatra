import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnthropicProvider } from "./anthropic/anthropic-provider.js";
import { ProviderError } from "./errors.js";
import { createGeminiProvider } from "./gemini/gemini-provider.js";
import { PROVIDER_CALL_FAILED_MESSAGE } from "./guard.js";
import { sdkLoadFailedMessage } from "./lazy-sdk.js";
import type { TranslateRequest, TranslationProvider } from "./provider.js";
import { entry, regexExtractor } from "./test-support.js";

vi.mock("@google/genai", () => {
  throw new Error("Cannot find package '/home/user/project/node_modules/@google/genai'");
});

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor() {
      throw new Error("invalid client option");
    }
  },
}));

const request: TranslateRequest = {
  sourceLocale: "en",
  targetLocale: "de",
  entries: [entry("greeting", "Hello")],
  extractPlaceholders: regexExtractor,
};

const KEY_VARS = ["ANTHROPIC_API_KEY", "GEMINI_API_KEY"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEY_VARS.map((name) => [name, process.env[name]]));
  for (const name of KEY_VARS) {
    process.env[name] = "test-key-value";
  }
});

afterEach(() => {
  for (const [name, value] of Object.entries(saved)) {
    if (value === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = value;
    }
  }
});

async function failure(provider: TranslationProvider): Promise<ProviderError> {
  const caught = await provider.translateBatch(request).catch((error: unknown) => error);
  expect(caught).toBeInstanceOf(ProviderError);
  return caught as ProviderError;
}

describe("a provider whose SDK is loaded on the first call", () => {
  it("reports a package that cannot be loaded as PROVIDER_ERROR naming the package", async () => {
    const provider = createGeminiProvider({ model: "gemini-2.5-flash", maxOutputTokens: 64 });

    const error = await failure(provider);

    expect(error.code).toBe("PROVIDER_ERROR");
    expect(error.message).toBe(sdkLoadFailedMessage("@google/genai"));
  });

  it("reports an SDK constructor that throws as a PROVIDER_ERROR call failure", async () => {
    const provider = createAnthropicProvider({ model: "claude-sonnet-4-5", maxTokens: 64 });

    const error = await failure(provider);

    expect(error.code).toBe("PROVIDER_ERROR");
    expect(error.message).toBe(PROVIDER_CALL_FAILED_MESSAGE);
  });
});
