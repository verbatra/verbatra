import { ProviderError } from "./errors.js";

export const PROVIDER_ENV = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  deepl: "DEEPL_API_KEY",
  "google-translate": "GOOGLE_TRANSLATE_API_KEY",
} as const;

function readRequiredEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new ProviderError("MISSING_API_KEY", `The ${name} environment variable is not set.`);
  }
  return value;
}

export function requireAnthropicKey(): string {
  return readRequiredEnv(PROVIDER_ENV.anthropic);
}

export function requireOpenAiKey(): string {
  return readRequiredEnv(PROVIDER_ENV.openai);
}

export function requireGeminiKey(): string {
  return readRequiredEnv(PROVIDER_ENV.gemini);
}

export function requireDeepLKey(): string {
  return readRequiredEnv(PROVIDER_ENV.deepl);
}

export function requireGoogleTranslateKey(): string {
  return readRequiredEnv(PROVIDER_ENV["google-translate"]);
}

export const OPENAI_COMPATIBLE_ENV_VAR = "OPENAI_COMPATIBLE_API_KEY";

export const OPENAI_COMPATIBLE_KEY_PLACEHOLDER = "local";

export function resolveOpenAiCompatibleKey(customEnvVar?: string): string {
  const varName = customEnvVar ?? OPENAI_COMPATIBLE_ENV_VAR;
  const value = process.env[varName];
  if (value !== undefined && value.length > 0) {
    return value;
  }
  if (customEnvVar !== undefined) {
    throw new ProviderError(
      "MISSING_API_KEY",
      `The ${customEnvVar} environment variable is not set.`,
    );
  }
  return OPENAI_COMPATIBLE_KEY_PLACEHOLDER;
}
