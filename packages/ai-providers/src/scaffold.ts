import type { AnthropicConfig } from "./anthropic/config.js";
import type { GeminiConfig } from "./gemini/config.js";
import type { OpenAiConfig } from "./openai/config.js";
import type { OpenCodeConfig } from "./opencode/config.js";

export const SCAFFOLD_MODELS = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-5.4-mini",
  gemini: "gemini-2.5-flash",
  opencode: "glm-5.3",
} as const;

export const SCAFFOLD_TOKEN_LIMIT_KEYS = {
  anthropic: "maxTokens",
  openai: "maxOutputTokens",
  gemini: "maxOutputTokens",
  opencode: "maxOutputTokens",
} as const satisfies {
  anthropic: keyof AnthropicConfig;
  openai: keyof OpenAiConfig;
  gemini: keyof GeminiConfig;
  opencode: keyof OpenCodeConfig;
};
