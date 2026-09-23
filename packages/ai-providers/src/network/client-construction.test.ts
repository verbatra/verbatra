import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const constructed = vi.hoisted(() => ({
  anthropic: [] as unknown[],
  openai: [] as unknown[],
  gemini: [] as unknown[],
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor(options: unknown) {
      constructed.anthropic.push(options);
    }
  },
}));

vi.mock("openai", () => ({
  default: class {
    constructor(options: unknown) {
      constructed.openai.push(options);
    }
  },
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    constructor(options: unknown) {
      constructed.gemini.push(options);
    }
  },
}));

const { createDefaultClient: createAnthropicClient } = await import("../anthropic/client.js");
const { createDefaultClient: createOpenAiClient } = await import("../openai/client.js");
const { createDefaultClient: createCompatibleClient } = await import(
  "../openai-compatible/client.js"
);
const { createDefaultClient: createGeminiClient } = await import("../gemini/client.js");

const KEY_VARS = ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY"];
let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(KEY_VARS.map((name) => [name, process.env[name]]));
  for (const name of KEY_VARS) {
    process.env[name] = "test-key-value";
  }
  constructed.anthropic.length = 0;
  constructed.openai.length = 0;
  constructed.gemini.length = 0;
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

const compatibleConfig = {
  baseUrl: "http://localhost:11434/v1",
  model: "local",
  maxOutputTokens: 64,
};

const restricted = {
  policy: {
    rules: [{ source: "config" as const, policy: "local-only" as const, allowedHosts: [] }],
  },
  env: {},
};

describe("client construction without a network policy", () => {
  it("passes exactly the options it passed before the policy existed", () => {
    createAnthropicClient();
    createOpenAiClient();
    createCompatibleClient(compatibleConfig);
    createGeminiClient();

    expect(constructed.anthropic).toEqual([{ apiKey: "test-key-value", logLevel: "off" }]);
    expect(constructed.openai).toEqual([
      { apiKey: "test-key-value", logLevel: "off" },
      { apiKey: "local", baseURL: "http://localhost:11434/v1", logLevel: "off" },
    ]);
    expect(constructed.gemini).toEqual([{ apiKey: "test-key-value" }]);
  });
});

describe("client construction under a restrictive network policy", () => {
  it("pins the resolved base URL and a guarded fetch", () => {
    createAnthropicClient(restricted);
    createOpenAiClient(restricted);
    createCompatibleClient(compatibleConfig, restricted);
    createGeminiClient(restricted);

    expect(constructed.anthropic[0]).toMatchObject({
      baseURL: "https://api.anthropic.com",
      fetch: expect.any(Function),
    });
    expect(constructed.openai[0]).toMatchObject({
      baseURL: "https://api.openai.com/v1",
      fetch: expect.any(Function),
    });
    expect(constructed.openai[1]).toMatchObject({
      baseURL: "http://localhost:11434/v1",
      fetch: expect.any(Function),
    });
    expect(constructed.gemini[0]).toMatchObject({
      httpOptions: {
        baseUrl: "https://generativelanguage.googleapis.com/",
        fetch: expect.any(Function),
      },
    });
  });
});
