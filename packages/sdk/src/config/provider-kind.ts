import type { ProviderKind } from "@verbatra/ai-providers";
import type { MachineProviderId } from "./provider-config.js";

type ProviderKindTable = { [K in MachineProviderId]: ProviderKind };

export const PROVIDER_KIND: ProviderKindTable = {
  anthropic: "llm",
  openai: "llm",
  gemini: "llm",
  deepl: "machine-translation",
  "google-translate": "machine-translation",
  "openai-compatible": "llm",
  libretranslate: "machine-translation",
};

export function kindOf(id: MachineProviderId): ProviderKind {
  return PROVIDER_KIND[id];
}
