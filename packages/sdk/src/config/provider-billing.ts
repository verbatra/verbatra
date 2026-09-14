import type { ProviderConfig, ProviderId } from "./provider-config.js";

/**
 * What a provider charges for: `tokens` for the prompt-driven LLMs, which bill the prompt and the
 * completion separately, and `characters` for the machine-translation APIs, which bill the source
 * text they are handed and report no token usage at all.
 */
export type BillingUnit = "tokens" | "characters";

/**
 * How one provider bills. `billedByApi` is false for a self-hosted endpoint, which still consumes
 * tokens but sends no invoice, so an estimate reports its quantity and no currency figure.
 */
export interface ProviderBilling {
  /** The quantity this provider charges for. */
  readonly unit: BillingUnit;
  /** Whether a hosted API bills for the work at all. */
  readonly billedByApi: boolean;
}

type ProviderBillingTable = { [K in ProviderId]: ProviderBilling };

export const PROVIDER_BILLING: ProviderBillingTable = {
  anthropic: { unit: "tokens", billedByApi: true },
  openai: { unit: "tokens", billedByApi: true },
  gemini: { unit: "tokens", billedByApi: true },
  deepl: { unit: "characters", billedByApi: true },
  "google-translate": { unit: "characters", billedByApi: true },
  "openai-compatible": { unit: "tokens", billedByApi: false },
};

export function billingFor(id: ProviderId): ProviderBilling {
  return PROVIDER_BILLING[id];
}

export function modelOf(provider: ProviderConfig): string | undefined {
  switch (provider.id) {
    case "anthropic":
    case "openai":
    case "gemini":
    case "openai-compatible":
      return provider.options.model;
    case "deepl":
    case "google-translate":
      return undefined;
  }
}

export function rateKeyFor(provider: ProviderConfig): string {
  const model = modelOf(provider);
  return model === undefined ? provider.id : `${provider.id}/${model}`;
}
