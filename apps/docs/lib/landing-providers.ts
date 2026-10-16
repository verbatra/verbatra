import type { MachineProviderId } from "./landing-facts";

export type ProviderKind = "llm" | "machine" | "local";

type ProviderDisplay = {
  readonly label: string;
  readonly kind: ProviderKind;
  readonly shortLabel?: string;
};

export const PROVIDER_DISPLAY: Readonly<Record<MachineProviderId, ProviderDisplay>> = {
  anthropic: { label: "Anthropic", kind: "llm" },
  openai: { label: "OpenAI", kind: "llm" },
  gemini: { label: "Gemini", kind: "llm" },
  deepl: { label: "DeepL", kind: "machine" },
  "google-translate": { label: "Google Cloud Translation", kind: "machine" },
  "openai-compatible": {
    label: "Ollama, LM Studio, vLLM",
    kind: "local",
    shortLabel: "OpenAI-compatible",
  },
  libretranslate: { label: "LibreTranslate", kind: "local" },
};

export function providerShortLabel(id: MachineProviderId): string {
  const display = PROVIDER_DISPLAY[id];
  return display.shortLabel ?? display.label;
}
