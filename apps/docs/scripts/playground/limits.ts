export const MAX_ITEMS = 12;
export const MAX_ITEM_LENGTH = 40;
export const MAX_LANGUAGES = 5;
export const LANGUAGE_ALLOWLIST = ["de", "es", "fr", "ja", "pt-BR"] as const;
export const ATTEMPT_CAP = 20;
export const MODEL = "gemini-2.5-flash";
export const MAX_OUTPUT_TOKENS = 2048;
export const PROVIDER_BATCH_SIZE = 50;
export const SOURCE_LOCALE = "en";
export const PLAYGROUND_KEY_VAR = "GEMINI_PLAYGROUND_API_KEY";
export const PROVIDER_KEY_VAR = "GEMINI_API_KEY";

export type AllowedLanguage = (typeof LANGUAGE_ALLOWLIST)[number];
