import { declareKeyEnvVar } from "@verbatra/ai-providers";
import type { ProviderConfig } from "./provider-config.js";

export function declareProviderKeyEnvVar(provider: ProviderConfig): void {
  if (provider.id === "openai-compatible" && provider.options.apiKeyEnvVar !== undefined) {
    declareKeyEnvVar(provider.options.apiKeyEnvVar);
  }
}
