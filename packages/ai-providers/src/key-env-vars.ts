export const PROVIDER_ENV = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
  deepl: "DEEPL_API_KEY",
  "google-translate": "GOOGLE_TRANSLATE_API_KEY",
} as const;

export const OPENAI_COMPATIBLE_ENV_VAR = "OPENAI_COMPATIBLE_API_KEY";

export const LIBRETRANSLATE_ENV_VAR = "LIBRETRANSLATE_API_KEY";

export const DECLARED_KEY_ENV_VARS = Symbol.for("verbatra.keyEnvVars.v1");

type RegistryScope = Record<typeof DECLARED_KEY_ENV_VARS, Set<string> | undefined>;

export function declaredKeyEnvVars(): Set<string> {
  const scope = globalThis as unknown as RegistryScope;
  const existing = scope[DECLARED_KEY_ENV_VARS];
  if (existing !== undefined) {
    return existing;
  }
  const created = new Set<string>();
  scope[DECLARED_KEY_ENV_VARS] = created;
  return created;
}

export function declareKeyEnvVar(name: string): void {
  declaredKeyEnvVars().add(name);
}

export function keyEnvVarNames(): readonly string[] {
  return [
    ...Object.values(PROVIDER_ENV),
    OPENAI_COMPATIBLE_ENV_VAR,
    LIBRETRANSLATE_ENV_VAR,
    ...declaredKeyEnvVars(),
  ];
}
