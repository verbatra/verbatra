import type { OpenLanguageSupport } from "../provider.js";

const keepLocale = (locale: string): string => locale;

export const LLM_WELL_TESTED_LANGUAGES = [
  "ar",
  "de",
  "en",
  "es",
  "fr",
  "hi",
  "id",
  "it",
  "ja",
  "ko",
  "nl",
  "pl",
  "pt",
  "ru",
  "sv",
  "tr",
  "uk",
  "vi",
  "zh",
] as const;

export const llmLanguageSupport: OpenLanguageSupport = {
  coverage: "open",
  version: "2026-09-28",
  wellTestedLanguages: LLM_WELL_TESTED_LANGUAGES,
  toSourceCode: keepLocale,
  toTargetCode: keepLocale,
};
