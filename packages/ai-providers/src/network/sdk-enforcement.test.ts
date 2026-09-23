import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAnthropicProvider } from "../anthropic/anthropic-provider.js";
import { ProviderError } from "../errors.js";
import { createGeminiProvider } from "../gemini/gemini-provider.js";
import { createGoogleTranslateProvider } from "../google-translate/google-translate-provider.js";
import { createOpenAiProvider } from "../openai/openai-provider.js";
import { createOpenAiCompatibleProvider } from "../openai-compatible/openai-compatible-provider.js";
import type { TranslateRequest, TranslationProvider } from "../provider.js";
import { entry, regexExtractor } from "../test-support.js";
import type { FetchLike } from "./guarded-fetch.js";
import type { NetworkPolicy } from "./policy.js";
import type { ProviderNetwork } from "./transport.js";

const LOCAL_ONLY: NetworkPolicy = {
  rules: [{ source: "config", policy: "local-only", allowedHosts: [] }],
};

const request: TranslateRequest = {
  sourceLocale: "en",
  targetLocale: "de",
  entries: [entry("greeting", "Hello")],
  extractPlaceholders: regexExtractor,
};

const KEY_VARS = [
  "ANTHROPIC_API_KEY",
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_TRANSLATE_API_KEY",
];

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

function network(send: FetchLike, env: ProviderNetwork["env"] = {}): ProviderNetwork {
  return { policy: LOCAL_ONLY, env, deps: { fetch: send, lookup: async () => ["203.0.113.5"] } };
}

async function failure(provider: TranslationProvider): Promise<ProviderError> {
  const caught = await provider.translateBatch(request).catch((error: unknown) => error);
  expect(caught).toBeInstanceOf(ProviderError);
  return caught as ProviderError;
}

function urlOf(send: ReturnType<typeof vi.fn<FetchLike>>): string {
  const input = send.mock.calls[0]?.[0];
  return input instanceof Request ? input.url : String(input);
}

describe("the network policy inside the real SDK clients", () => {
  it("blocks a hosted provider's pinned endpoint before any request is sent", async () => {
    const send = vi.fn<FetchLike>();
    const provider = createAnthropicProvider(
      { model: "claude-sonnet-4-5", maxTokens: 64 },
      { network: network(send) },
    );
    const error = await failure(provider);
    expect(error.code).toBe("NETWORK_POLICY_VIOLATION");
    expect(error.message).toContain("The request to api.anthropic.com was blocked");
    expect(send).not.toHaveBeenCalled();
  }, 15_000);

  it("stops a redirect from a local server to a public host", async () => {
    const send = vi.fn<FetchLike>(
      async () =>
        new Response(null, { status: 308, headers: { location: "https://collector.example/x" } }),
    );
    const provider = createOpenAiCompatibleProvider(
      { baseUrl: "http://127.0.0.1:1234/v1", model: "local", maxOutputTokens: 64 },
      { network: network(send) },
    );
    const error = await failure(provider);
    expect(error.code).toBe("NETWORK_POLICY_VIOLATION");
    expect(error.message).toContain("collector.example");
    expect(urlOf(send)).toBe("http://127.0.0.1:1234/v1/chat/completions");
  }, 15_000);

  it("pins the OpenAI base URL resolved at check time", async () => {
    const send = vi.fn<FetchLike>(async () => new Response("{}", { status: 400 }));
    const provider = createOpenAiProvider(
      { model: "gpt-5-mini", maxOutputTokens: 64 },
      { network: network(send, { OPENAI_BASE_URL: "http://10.0.0.8:9000/v1" }) },
    );
    await failure(provider);
    expect(urlOf(send)).toBe("http://10.0.0.8:9000/v1/chat/completions");
  });

  it("routes Gemini through the guarded fetch", async () => {
    const send = vi.fn<FetchLike>(async () => new Response("{}", { status: 400 }));
    const provider = createGeminiProvider(
      { model: "gemini-2.5-flash", maxOutputTokens: 64 },
      { network: network(send, { GOOGLE_GEMINI_BASE_URL: "http://127.0.0.1:7000" }) },
    );
    await failure(provider);
    expect(urlOf(send).startsWith("http://127.0.0.1:7000/")).toBe(true);
  });

  it("routes Google Cloud Translation through the guarded fetch", async () => {
    const send = vi.fn<FetchLike>();
    const provider = createGoogleTranslateProvider({}, { network: network(send) });
    const error = await failure(provider);
    expect(error.code).toBe("NETWORK_POLICY_VIOLATION");
    expect(error.message).not.toContain("test-key-value");
    expect(error.message).not.toContain("/language/translate");
    expect(send).not.toHaveBeenCalled();
  });
});
