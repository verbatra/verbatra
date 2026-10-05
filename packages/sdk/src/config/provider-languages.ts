import {
  deepLLanguageSupport,
  googleTranslateLanguageSupport,
  libreTranslateLanguageSupport,
  llmLanguageSupport,
  type ProviderLanguageSupport,
} from "@verbatra/ai-providers";
import type { MachineProviderConfig, MachineProviderId } from "./provider-config.js";

type ProviderLanguageSupportTable = {
  [K in MachineProviderId]: (
    options: Extract<MachineProviderConfig, { id: K }>["options"],
  ) => ProviderLanguageSupport;
};

const PROVIDER_LANGUAGES: ProviderLanguageSupportTable = {
  anthropic: () => llmLanguageSupport,
  openai: () => llmLanguageSupport,
  gemini: () => llmLanguageSupport,
  deepl: () => deepLLanguageSupport,
  "google-translate": () => googleTranslateLanguageSupport,
  "openai-compatible": () => llmLanguageSupport,
  libretranslate: (options) => libreTranslateLanguageSupport(options.baseUrl),
};

export function languageSupportOf(provider: MachineProviderConfig): ProviderLanguageSupport {
  const supportFor = PROVIDER_LANGUAGES[provider.id] as (
    options: MachineProviderConfig["options"],
  ) => ProviderLanguageSupport;
  return supportFor(provider.options);
}
