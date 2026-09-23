import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createAnthropicProvider } from "./anthropic/anthropic-provider.js";
import type { MessagesClient } from "./anthropic/types.js";
import { ProviderError } from "./errors.js";
import { declareKeyEnvVar } from "./key-env-vars.js";
import type { TranslateRequest } from "./provider.js";
import {
  entry,
  regexExtractor,
  resetDeclaredKeyEnvVars,
  stubClient,
  toolMessage,
} from "./test-support.js";

const FAKE_KEY = "sk-ant-SENTINELKEY123";
const CONTENT = "TRANSLATABLE-CONTENT-SENTINEL";
const SENTINELS = [FAKE_KEY, CONTENT, "x-api-key", "Bearer"];

const config = { model: "m", maxTokens: 64 };

function contentRequest(overrides: Partial<TranslateRequest> = {}): TranslateRequest {
  return {
    sourceLocale: "en",
    targetLocale: "de",
    entries: [entry(CONTENT, CONTENT, [], { description: CONTENT, meaning: CONTENT })],
    glossary: { [CONTENT]: CONTENT },
    extractPlaceholders: regexExtractor,
    ...overrides,
  };
}

async function captureRejection(run: () => Promise<unknown>): Promise<ProviderError> {
  try {
    await run();
  } catch (error) {
    return error as ProviderError;
  }
  throw new Error("expected the call to reject");
}

function assertNoSentinel(error: ProviderError): void {
  const text = `${error.message} ${error.stack ?? ""}`;
  for (const sentinel of SENTINELS) {
    expect(text).not.toContain(sentinel);
  }
}

describe("ProviderError messages never carry variable input across every error path", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.ANTHROPIC_API_KEY;
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env.ANTHROPIC_API_KEY;
    } else {
      process.env.ANTHROPIC_API_KEY = saved;
    }
  });

  it("MISSING_API_KEY", () => {
    delete process.env.ANTHROPIC_API_KEY;
    let error: ProviderError | undefined;
    try {
      createAnthropicProvider(config);
    } catch (caught) {
      error = caught as ProviderError;
    }
    expect(error?.code).toBe("MISSING_API_KEY");
    if (error !== undefined) {
      assertNoSentinel(error);
    }
  });

  it("INVALID_REQUEST (missing extractor)", async () => {
    const { client } = stubClient(toolMessage([]));
    const broken = {
      ...contentRequest(),
      extractPlaceholders: undefined,
    } as unknown as TranslateRequest;
    const error = await captureRejection(() =>
      createAnthropicProvider(config, { client }).translateBatch(broken),
    );
    expect(error.code).toBe("INVALID_REQUEST");
    assertNoSentinel(error);
  });

  it("INVALID_REQUEST (malformed data)", async () => {
    const { client } = stubClient(toolMessage([]));
    const error = await captureRejection(() =>
      createAnthropicProvider(config, { client }).translateBatch(
        contentRequest({ sourceLocale: "" }),
      ),
    );
    expect(error.code).toBe("INVALID_REQUEST");
    assertNoSentinel(error);
  });

  it("INVALID_RESPONSE", async () => {
    const { client } = stubClient(
      toolMessage([
        { key: CONTENT, value: CONTENT },
        { key: "unexpected", value: FAKE_KEY },
      ]),
    );
    const error = await captureRejection(() =>
      createAnthropicProvider(config, { client }).translateBatch(contentRequest()),
    );
    expect(error.code).toBe("INVALID_RESPONSE");
    assertNoSentinel(error);
  });

  it("PROVIDER_ERROR (raw SDK error with auth headers)", async () => {
    const client: MessagesClient = {
      messages: {
        create: () => {
          throw new Error(
            `401 x-api-key: ${FAKE_KEY} authorization: Bearer ${FAKE_KEY} body=${CONTENT}`,
          );
        },
      },
    };
    const error = await captureRejection(() =>
      createAnthropicProvider(config, { client }).translateBatch(contentRequest()),
    );
    expect(error.code).toBe("PROVIDER_ERROR");
    assertNoSentinel(error);
  });
});

describe("ProviderError constructor scrubs key shapes as a defense-in-depth backstop", () => {
  it("redacts all four v1 key shapes from a key-bearing message", () => {
    const openAiKey = "sk-proj-ABCDEFGH1234567890";
    const anthropicKey = "sk-ant-api03-ABCdef12345_-XYZ";
    const geminiKey = "AIzaabcdefghijklmnopqrstuvwxyz012345678";
    const deepLKey = "abcdef12-3456-7890-abcd-ef1234567890:fx";
    const error = new ProviderError(
      "PROVIDER_ERROR",
      `leak ${openAiKey} ${anthropicKey} ${geminiKey} ${deepLKey}`,
    );
    for (const key of [openAiKey, anthropicKey, geminiKey, deepLKey]) {
      expect(error.message).not.toContain(key);
    }
    expect(error.message).toContain("[REDACTED]");
  });

  it.each([
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "DEEPL_API_KEY",
    "GOOGLE_TRANSLATE_API_KEY",
    "OPENAI_COMPATIBLE_API_KEY",
    "MY_LOCAL_KEY",
  ])("scrubs the exact value of %s, built-in or declared through apiKeyEnvVar", (name) => {
    resetDeclaredKeyEnvVars();
    declareKeyEnvVar("MY_LOCAL_KEY");
    const saved = process.env[name];
    process.env[name] = "fake-unshaped-key-value";
    try {
      const error = new ProviderError(
        "PROVIDER_ERROR",
        "carrying fake-unshaped-key-value verbatim",
      );
      expect(error.message).not.toContain("fake-unshaped-key-value");
      expect(error.message).toBe("carrying [REDACTED] verbatim");
    } finally {
      resetDeclaredKeyEnvVars();
      if (saved === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = saved;
      }
    }
  });
});
