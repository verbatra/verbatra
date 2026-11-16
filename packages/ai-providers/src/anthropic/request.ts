import { deriveJsonSchema, translationsResultSchema } from "../llm/schema.js";
import { SHARED_SYSTEM_RULES } from "../llm/system-rules.js";
import type { AnthropicConfig } from "./config.js";

export const SYSTEM_RULES = SHARED_SYSTEM_RULES.join("\n");

const OUTPUT_CONFIG = {
  format: { type: "json_schema", schema: deriveJsonSchema(translationsResultSchema) },
} as const;

export interface BuiltRequest {
  readonly model: string;
  readonly max_tokens: number;
  readonly system: string;
  readonly messages: readonly [{ readonly role: "user"; readonly content: string }];
  readonly output_config: typeof OUTPUT_CONFIG;
}

export function buildRequest(config: AnthropicConfig, payloadJson: string): BuiltRequest {
  return {
    model: config.model,
    max_tokens: config.maxTokens,
    system: SYSTEM_RULES,
    messages: [{ role: "user", content: payloadJson }],
    output_config: OUTPUT_CONFIG,
  };
}
