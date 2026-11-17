import { describe, expect, expectTypeOf, it } from "vitest";
import { buildRequest } from "../anthropic/request.js";
import { buildGeminiRequest } from "../gemini/request.js";
import { toGeminiSchema } from "../gemini/schema.js";
import { buildOpenAiRequest } from "../openai/request.js";
import { deriveJsonSchema, translationsResultSchema } from "./schema.js";

describe("canonical schema single source of truth", () => {
  it("all three providers derive their API-specific schema from the one canonical schema", () => {
    const canonical = deriveJsonSchema(translationsResultSchema);

    const anthropic = buildRequest({ model: "m", maxTokens: 16 }, "{}");
    const openai = buildOpenAiRequest({ model: "m", maxOutputTokens: 16 }, "{}");
    const gemini = buildGeminiRequest({ model: "m", maxOutputTokens: 16 }, "{}");

    if (openai.response_format.type !== "json_schema") {
      throw new Error("expected the default strict-schema response_format");
    }
    expect(anthropic.output_config.format.schema).toEqual(canonical);
    expect(openai.response_format.json_schema.schema).toEqual(canonical);
    expect(anthropic.output_config.format.schema).toEqual(
      openai.response_format.json_schema.schema,
    );

    expect(gemini.config.responseSchema).toEqual(toGeminiSchema(canonical));
  });

  it("the derived schema constrains output to per-key key/value pairs", () => {
    const schema = deriveJsonSchema(translationsResultSchema);
    expect(schema).toMatchObject({
      type: "object",
      properties: { translations: { type: "array" } },
    });
    expect(schema).not.toHaveProperty("$schema");
  });

  it("carries the object type keyword Anthropic's output_config schema requires", () => {
    const schema = deriveJsonSchema(translationsResultSchema);

    expect(schema.type).toBe("object");
    expectTypeOf(schema.type).toEqualTypeOf<"object">();
  });
});
