import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createDefaultClient } from "./client.js";
import type { OpenAiCompatibleConfig } from "./config.js";

interface CapturedOptions {
  readonly apiKey?: string | null;
  readonly baseURL?: string;
  readonly logLevel?: string;
}

const capturedOptions: CapturedOptions[] = [];

vi.mock("openai", () => {
  class FakeOpenAI {
    readonly chat = { completions: { create: vi.fn() } };
    constructor(options: CapturedOptions) {
      capturedOptions.push(options);
    }
  }
  return { default: FakeOpenAI };
});

async function construct(config: OpenAiCompatibleConfig): Promise<void> {
  await createDefaultClient(config).chat.completions.create({} as never);
}

describe("createDefaultClient: structural isolation from the hosted openai key path", () => {
  let savedOpenAiKey: string | undefined;
  let savedCompatibleKey: string | undefined;

  beforeEach(() => {
    capturedOptions.length = 0;
    savedOpenAiKey = process.env.OPENAI_API_KEY;
    savedCompatibleKey = process.env.OPENAI_COMPATIBLE_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_COMPATIBLE_API_KEY;
  });

  afterEach(() => {
    if (savedOpenAiKey === undefined) {
      delete process.env.OPENAI_API_KEY;
    } else {
      process.env.OPENAI_API_KEY = savedOpenAiKey;
    }
    if (savedCompatibleKey === undefined) {
      delete process.env.OPENAI_COMPATIBLE_API_KEY;
    } else {
      process.env.OPENAI_COMPATIBLE_API_KEY = savedCompatibleKey;
    }
  });

  it("passes the local placeholder and the configured baseUrl even when OPENAI_API_KEY is set", async () => {
    process.env.OPENAI_API_KEY = "hosted-key-should-never-reach-a-custom-baseUrl";
    await construct({
      baseUrl: "http://192.168.178.74:1234",
      model: "qwen2.5-14b-instruct",
      maxOutputTokens: 1024,
    });
    expect(capturedOptions[0]).toMatchObject({
      apiKey: "local",
      baseURL: "http://192.168.178.74:1234",
      logLevel: "off",
    });
    expect(capturedOptions[0]?.apiKey).not.toBe("hosted-key-should-never-reach-a-custom-baseUrl");
  });

  it("passes the OPENAI_COMPATIBLE_API_KEY convention value when set", async () => {
    process.env.OPENAI_COMPATIBLE_API_KEY = "convention-key";
    await construct({ baseUrl: "http://localhost:1234", model: "m", maxOutputTokens: 10 });
    expect(capturedOptions[0]?.apiKey).toBe("convention-key");
  });

  it("passes a resolved apiKeyEnvVar value, never the convention variable, when both are set", async () => {
    process.env.OPENAI_COMPATIBLE_API_KEY = "convention-key";
    process.env.LM_STUDIO_KEY = "named-key";
    await construct({
      baseUrl: "http://localhost:1234",
      model: "m",
      maxOutputTokens: 10,
      apiKeyEnvVar: "LM_STUDIO_KEY",
    });
    expect(capturedOptions[0]?.apiKey).toBe("named-key");
    delete process.env.LM_STUDIO_KEY;
  });
});
