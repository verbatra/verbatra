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

export const PROVIDER_KINDS: ReadonlyArray<ProviderKind> = ["llm", "machine", "local"];

type ProviderGroup = {
  readonly kind: ProviderKind;
  readonly providers: ReadonlyArray<{ readonly id: MachineProviderId; readonly label: string }>;
};

export function providerGroups(): ReadonlyArray<ProviderGroup> {
  const entries = Object.entries(PROVIDER_DISPLAY) as ReadonlyArray<
    [MachineProviderId, ProviderDisplay]
  >;
  return PROVIDER_KINDS.map((kind) => ({
    kind,
    providers: entries
      .filter(([, display]) => display.kind === kind)
      .map(([id, display]) => ({ id, label: display.label })),
  }));
}

export const HUMAN_ONLY_PROVIDER = "none";
