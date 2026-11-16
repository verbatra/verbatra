import { describe, expect, it } from "vitest";
import { deriveJsonSchema, translationsResultSchema } from "../llm/schema.js";
import type { TranslateRequest } from "../provider.js";
import { entry, firstCallOf, regexExtractor, stubClient, textMessage } from "../test-support.js";
import { createAnthropicProvider } from "./anthropic-provider.js";

const config = { model: "m", maxTokens: 64 };

function request(): TranslateRequest {
  return {
    sourceLocale: "en",
    targetLocale: "de",
    entries: [entry("greeting", "Hello {{name}}", ["{{name}}"])],
    extractPlaceholders: regexExtractor,
  };
}

describe("Anthropic derived-schema is exercised through the provider", () => {
  it("carries the derived schema on the built request and still maps the response", async () => {
    const { client, calls } = stubClient(
      textMessage([{ key: "greeting", value: "Hallo {{name}}" }]),
    );
    const result = await createAnthropicProvider(config, { client }).translateBatch(request());

    const body = firstCallOf(calls);
    expect(body.output_config.format).toEqual({
      type: "json_schema",
      schema: deriveJsonSchema(translationsResultSchema),
    });
    expect(body).not.toHaveProperty("tools");
    expect(body).not.toHaveProperty("tool_choice");

    expect(result.values.get("greeting")).toBe("Hallo {{name}}");
    expect(result.integrity.get("greeting")?.matches).toBe(true);
  });
});
