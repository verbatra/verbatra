import type { ProviderKind } from "@verbatra/ai-providers";
import type { ProviderId } from "./provider-config.js";

type ProviderKindTable = { [K in ProviderId]: ProviderKind };

export const PROVIDER_KIND: ProviderKindTable = {
  anthropic: "llm",
  openai: "llm",
  gemini: "llm",
  deepl: "machine-translation",
  "google-translate": "machine-translation",
  "openai-compatible": "llm",
};

export function kindOf(id: ProviderId): ProviderKind {
  return PROVIDER_KIND[id];
}
