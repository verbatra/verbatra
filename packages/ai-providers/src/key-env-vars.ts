export const PROVIDER_ENV = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  deepl: "DEEPL_API_KEY",
  "google-translate": "GOOGLE_TRANSLATE_API_KEY",
} as const;

export const OPENAI_COMPATIBLE_ENV_VAR = "OPENAI_COMPATIBLE_API_KEY";

const declaredKeyEnvVars = new Set<string>();

export function declareKeyEnvVar(name: string): void {
  declaredKeyEnvVars.add(name);
}

export function keyEnvVarNames(): readonly string[] {
  return [...Object.values(PROVIDER_ENV), OPENAI_COMPATIBLE_ENV_VAR, ...declaredKeyEnvVars];
}
