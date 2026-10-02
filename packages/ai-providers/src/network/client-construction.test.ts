import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const constructed = vi.hoisted(() => ({
  anthropic: [] as unknown[],
  openai: [] as unknown[],
  gemini: [] as unknown[],
}));

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    readonly messages = { create: async () => ({ content: [] }) };
    constructor(options: unknown) {
      constructed.anthropic.push(options);
    }
  },
}));

vi.mock("openai", () => ({
  default: class {
    readonly chat = { completions: { create: async () => ({ choices: [] }) } };
    constructor(options: unknown) {
      constructed.openai.push(options);
    }
  },
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    readonly models = { generateContent: async () => ({}) };
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

async function constructAll(network?: typeof restricted): Promise<void> {
  const body = {} as never;
  await createAnthropicClient(network).messages.create(body);
  await createOpenAiClient(network).chat.completions.create(body);
  await createCompatibleClient(compatibleConfig, network).chat.completions.create(body);
  await createGeminiClient(network).models.generateContent(body);
}

describe("client construction without a network policy", () => {
  it("passes exactly the options it passed before the policy existed", async () => {
    await constructAll();

    expect(constructed.anthropic).toEqual([{ apiKey: "test-key-value", logLevel: "off" }]);
    expect(constructed.openai).toEqual([
      { apiKey: "test-key-value", logLevel: "off" },
      { apiKey: "local", baseURL: "http://localhost:11434/v1", logLevel: "off" },
    ]);
    expect(constructed.gemini).toEqual([{ apiKey: "test-key-value" }]);
  });
});

describe("client construction under a restrictive network policy", () => {
  it("pins the resolved base URL and a guarded fetch", async () => {
    await constructAll(restricted);

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

describe("lazy SDK construction", () => {
  it("constructs no SDK client until the first call", () => {
    createAnthropicClient();
    createOpenAiClient();
    createCompatibleClient(compatibleConfig);
    createGeminiClient();

    expect(constructed).toEqual({ anthropic: [], openai: [], gemini: [] });
  });

  it("constructs one client across sequential and concurrent calls", async () => {
    const client = createAnthropicClient();
    const body = {} as never;
    await Promise.all([client.messages.create(body), client.messages.create(body)]);
    await client.messages.create(body);

    expect(constructed.anthropic).toHaveLength(1);
  });

  it.each([
    ["ANTHROPIC_API_KEY", () => createAnthropicClient()],
    ["OPENAI_API_KEY", () => createOpenAiClient()],
    ["GEMINI_API_KEY", () => createGeminiClient()],
  ])("still throws MISSING_API_KEY synchronously when %s is unset", (name, create) => {
    delete process.env[name];

    expect(create).toThrow(expect.objectContaining({ code: "MISSING_API_KEY", envVar: name }));
  });
});
