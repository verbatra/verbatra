import { deriveJsonSchema, translationsResultSchema } from "../llm/schema.js";
import { SHARED_SYSTEM_RULES } from "../llm/system-rules.js";
import type { OpenAiConfig } from "./config.js";

const RESULT_SCHEMA_NAME = "translations";

export const OPENAI_SYSTEM_RULES = SHARED_SYSTEM_RULES.join("\n");

export type OpenAiRequestMode = "strict-schema" | "json-object";

export type OpenAiResponseFormat =
  | {
      readonly type: "json_schema";
      readonly json_schema: {
        readonly name: string;
        readonly strict: true;
        readonly schema: Record<string, unknown>;
      };
    }
  | { readonly type: "json_object" };

export type OpenAiTokenLimitField = "max_completion_tokens" | "max_tokens";

interface OpenAiRequestBase {
  readonly model: string;
  readonly messages: readonly [
    { readonly role: "system"; readonly content: string },
    { readonly role: "user"; readonly content: string },
  ];
  readonly response_format: OpenAiResponseFormat;
}

export type OpenAiRequest = OpenAiRequestBase &
  ({ readonly max_completion_tokens: number } | { readonly max_tokens: number });

function buildResponseFormat(mode: OpenAiRequestMode): OpenAiResponseFormat {
  if (mode === "json-object") {
    return { type: "json_object" };
  }
  return {
    type: "json_schema",
    json_schema: {
      name: RESULT_SCHEMA_NAME,
      strict: true,
      schema: deriveJsonSchema(translationsResultSchema),
    },
  };
}

export function buildOpenAiRequest(
  config: OpenAiConfig,
  payloadJson: string,
  mode: OpenAiRequestMode = "strict-schema",
  tokenLimitField: OpenAiTokenLimitField = "max_completion_tokens",
): OpenAiRequest {
  const base: OpenAiRequestBase = {
    messages: [
      { role: "system", content: OPENAI_SYSTEM_RULES },
      { role: "user", content: payloadJson },
    ],
    model: config.model,
    response_format: buildResponseFormat(mode),
  };
  if (tokenLimitField === "max_tokens") {
    return { ...base, max_tokens: config.maxOutputTokens };
  }
  return { ...base, max_completion_tokens: config.maxOutputTokens };
}
