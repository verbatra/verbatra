import { ProviderError } from "./errors.js";
import { OPENAI_COMPATIBLE_ENV_VAR, PROVIDER_ENV } from "./key-env-vars.js";
import type { EnvironmentSource } from "./network/environment-rule.js";

export function processEnvironment(): EnvironmentSource {
  return process.env;
}

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
