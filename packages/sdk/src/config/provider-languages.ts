import {
  deepLLanguageSupport,
  googleTranslateLanguageSupport,
  llmLanguageSupport,
  type ProviderLanguageSupport,
} from "@verbatra/ai-providers";
import type { MachineProviderId } from "./provider-config.js";

type ProviderLanguageSupportTable = { [K in MachineProviderId]: ProviderLanguageSupport };

const PROVIDER_LANGUAGES: ProviderLanguageSupportTable = {
  anthropic: llmLanguageSupport,
  openai: llmLanguageSupport,
  gemini: llmLanguageSupport,
  deepl: deepLLanguageSupport,
  "google-translate": googleTranslateLanguageSupport,
  "openai-compatible": llmLanguageSupport,
};

export function languageSupportOf(id: MachineProviderId): ProviderLanguageSupport {
  return PROVIDER_LANGUAGES[id];
}
