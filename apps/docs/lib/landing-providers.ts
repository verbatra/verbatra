import { MACHINE_PROVIDER_IDS, type MachineProviderId } from "./landing-facts";
import { providerReleaseBadge } from "./release-badge";

export const PROVIDER_KINDS = ["llm", "machine", "local"] as const;

export type ProviderKind = (typeof PROVIDER_KINDS)[number];

type ProviderDisplay = {
  readonly label: string;
  readonly kind: ProviderKind;
  readonly shortLabel?: string;
};

export type LandingProvider = {
  readonly id: MachineProviderId;
  readonly label: string;
  readonly kind: ProviderKind;
  readonly isNew: boolean;
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

export function landingProviders(): ReadonlyArray<LandingProvider> {
  return MACHINE_PROVIDER_IDS.map((id) => ({
    id,
    label: providerShortLabel(id),
    kind: PROVIDER_DISPLAY[id].kind,
    isNew: providerReleaseBadge(id) !== null,
  }));
}

export function providersOfKind(kind: ProviderKind): ReadonlyArray<MachineProviderId> {
  return MACHINE_PROVIDER_IDS.filter((id) => PROVIDER_DISPLAY[id].kind === kind);
}
