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

function network(
  send: FetchLike,
  env: ProviderNetwork["env"] = {},
  lookup = vi.fn(async () => ["203.0.113.5"]),
): ProviderNetwork {
  return { policy: LOCAL_ONLY, env, deps: { fetch: send, lookup } };
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

const builders: ReadonlyArray<
  readonly [string, (network: ProviderNetwork) => TranslationProvider]
> = [
  [
    "anthropic",
    (net) =>
      createAnthropicProvider({ model: "claude-sonnet-4-5", maxTokens: 64 }, { network: net }),
  ],
  [
    "openai",
    (net) => createOpenAiProvider({ model: "gpt-5-mini", maxOutputTokens: 64 }, { network: net }),
  ],
  [
    "openai-compatible",
    (net) =>
      createOpenAiCompatibleProvider(
        { baseUrl: "http://llm.internal:1234/v1", model: "local", maxOutputTokens: 64 },
        { network: net },
      ),
  ],
  [
    "gemini",
    (net) =>
      createGeminiProvider({ model: "gemini-2.5-flash", maxOutputTokens: 64 }, { network: net }),
  ],
  ["google-translate", (net) => createGoogleTranslateProvider({}, { network: net })],
];

describe("the network policy inside the real SDK clients", () => {
  it.each(builders)(
    "%s: a refused host fails once with NETWORK_POLICY_VIOLATION and is never retried",
    async (_, build) => {
      const send = vi.fn<FetchLike>();
      const lookup = vi.fn(async () => ["203.0.113.5"]);
      const error = await failure(build(network(send, {}, lookup)));
      expect(error.code).toBe("NETWORK_POLICY_VIOLATION");
      expect(error.message).toContain("was blocked");
      expect(error.message).not.toContain("test-key-value");
      expect(lookup).toHaveBeenCalledTimes(1);
      expect(send).not.toHaveBeenCalled();
    },
  );

  it.each(builders)(
    "%s: a cross-origin redirect is refused after exactly one request",
    async (_, build) => {
      const send = vi.fn<FetchLike>(
        async () =>
          new Response(null, { status: 308, headers: { location: "https://collector.example/x" } }),
      );
      const lookup = vi.fn(async () => ["10.0.0.9"]);
      const env = {
        ANTHROPIC_BASE_URL: "http://llm.internal:1234",
        OPENAI_BASE_URL: "http://llm.internal:1234/v1",
        GOOGLE_GEMINI_BASE_URL: "http://llm.internal:1234",
      };
      const policy: NetworkPolicy = {
        rules: [
          {
            source: "config",
            policy: "local-only",
            allowedHosts: ["translation.googleapis.com"],
          },
        ],
      };
      const error = await failure(build({ policy, env, deps: { fetch: send, lookup } }));
      expect(error.code).toBe("NETWORK_POLICY_VIOLATION");
      expect(error.message).toContain("collector.example");
      expect(send).toHaveBeenCalledTimes(1);
      expect(send.mock.calls.every(([input]) => !String(input).includes("collector"))).toBe(true);
    },
  );

  it.each([
    [
      "openai",
      (net: ProviderNetwork) =>
        createOpenAiProvider({ model: "gpt-5-mini", maxOutputTokens: 64 }, { network: net }),
      { OPENAI_BASE_URL: "http://127.0.0.1:9000/v1" },
    ],
    [
      "gemini",
      (net: ProviderNetwork) =>
        createGeminiProvider({ model: "gemini-2.5-flash", maxOutputTokens: 64 }, { network: net }),
      { GOOGLE_GEMINI_BASE_URL: "http://127.0.0.1:7000" },
    ],
  ] as const)(
    "%s: a real 400 from a permitted host stays a provider error, not a policy refusal",
    async (_, build, env) => {
      const send = vi.fn<FetchLike>(
        async () =>
          new Response(JSON.stringify({ error: { message: "bad request", code: 400 } }), {
            status: 400,
            headers: { "content-type": "application/json" },
          }),
      );
      const error = await failure(build(network(send, env)));
      expect(error.code).toBe("PROVIDER_ERROR");
      expect(send).toHaveBeenCalledTimes(1);
    },
  );

  it("pins the OpenAI base URL resolved at check time", async () => {
    const send = vi.fn<FetchLike>(async () => new Response("{}", { status: 400 }));
    const provider = createOpenAiProvider(
      { model: "gpt-5-mini", maxOutputTokens: 64 },
      { network: network(send, { OPENAI_BASE_URL: "http://10.0.0.8:9000/v1" }) },
    );
    await failure(provider);
    expect(urlOf(send)).toBe("http://10.0.0.8:9000/v1/chat/completions");
  });

  it("pins the Gemini base URL resolved at check time", async () => {
    const send = vi.fn<FetchLike>(async () => new Response("{}", { status: 400 }));
    const provider = createGeminiProvider(
      { model: "gemini-2.5-flash", maxOutputTokens: 64 },
      { network: network(send, { GOOGLE_GEMINI_BASE_URL: "http://127.0.0.1:7000" }) },
    );
    await failure(provider);
    expect(urlOf(send).startsWith("http://127.0.0.1:7000/")).toBe(true);
  });
});
