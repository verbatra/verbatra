import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProviderError } from "../errors.js";
import { keyEnvVarNames } from "../key-env-vars.js";
import { OPENCODE_BASE_URL, resolveProviderEndpoint } from "../network/endpoints.js";
import type { OpenAiClient } from "../openai/types.js";
import type { TranslateRequest } from "../provider.js";
import { redactKeys } from "../redaction.js";
import {
  entry,
  firstCallOf,
  openAiResult,
  openAiStubClient,
  regexExtractor,
} from "../test-support.js";
import { createOpenCodeProvider } from "./opencode-provider.js";

const config = { model: "glm-5.3", maxOutputTokens: 2048 };

function request(): TranslateRequest {
  return {
    sourceLocale: "en",
    targetLocale: "de",
    entries: [entry("greeting", "Hello {{name}}", ["{{name}}"])],
    extractPlaceholders: regexExtractor,
  };
}

describe("createOpenCodeProvider", () => {
  let saved: string | undefined;

  beforeEach(() => {
    saved = process.env.OPENCODE_API_KEY;
  });

  afterEach(() => {
    if (saved === undefined) {
      delete process.env.OPENCODE_API_KEY;
    } else {
      process.env.OPENCODE_API_KEY = saved;
    }
  });

  it("declares id opencode, llm kind, and glossary support", () => {
    const { client } = openAiStubClient(openAiResult([]));
    const provider = createOpenCodeProvider(config, { client });
    expect(provider.id).toBe("opencode");
    expect(provider.kind).toBe("llm");
    expect(provider.supportsGlossary).toBe(true);
  });

  it("sends the configured model and max_tokens through the shared chat mechanism", async () => {
    const { client, calls } = openAiStubClient(
      openAiResult([{ key: "greeting", value: "Hallo {{name}}" }]),
    );
    const result = await createOpenCodeProvider(config, { client }).translateBatch(request());
    expect(result.values.get("greeting")).toBe("Hallo {{name}}");
    expect(firstCallOf(calls)).toMatchObject({ model: "glm-5.3", max_tokens: 2048 });
  });

  it("names the host on a failed request and never points the user at a baseUrl it cannot set", async () => {
    class StatusError extends Error {
      readonly status = 404;
    }
    const client: OpenAiClient = {
      chat: { completions: { create: () => Promise.reject(new StatusError("not found")) } },
    };
    const failure = await createOpenCodeProvider(config, { client })
      .translateBatch(request())
      .catch((error: unknown) => error);
    expect(String((failure as Error).message)).toContain("opencode.ai");
    expect(String((failure as Error).message)).not.toContain("baseUrl");
  });

  it("rejects an invalid config before building a client", () => {
    expect(() => createOpenCodeProvider({ ...config, model: "" })).toThrow();
  });

  it("fails with MISSING_API_KEY naming the variable when no key is set and no client is injected", () => {
    delete process.env.OPENCODE_API_KEY;
    try {
      createOpenCodeProvider(config);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).code).toBe("MISSING_API_KEY");
      expect((error as ProviderError).envVar).toBe("OPENCODE_API_KEY");
    }
  });

  it("is a known public endpoint at the fixed Zen OpenAI base URL", () => {
    expect(OPENCODE_BASE_URL).toBe("https://opencode.ai/inference/openai/v1");
    expect(resolveProviderEndpoint({ id: "opencode" }, {})).toEqual({
      url: OPENCODE_BASE_URL,
      knownPublic: true,
      transport: "fetch",
    });
  });

  it("has its key variable redacted from error text", () => {
    process.env.OPENCODE_API_KEY = "oc_sk_secret_value_1234567890";
    expect(keyEnvVarNames()).toContain("OPENCODE_API_KEY");
    expect(redactKeys("failed with oc_sk_secret_value_1234567890")).not.toContain(
      "oc_sk_secret_value_1234567890",
    );
  });
});
