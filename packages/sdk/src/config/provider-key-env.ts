import { declareKeyEnvVar } from "@verbatra/ai-providers";
import type { ProviderConfig } from "./provider-config.js";

/**
 * Marks the environment variable a provider config names as its key source as secret, so
 * {@link redact} scrubs its value exactly like the built-in provider key variables. Today only an
 * `openai-compatible` provider with `apiKeyEnvVar` names one; every other config is a no-op.
 *
 * {@link loadConfig} and building the provider already do this, so call it only when a config
 * reaches your code some other way. Declarations are process-wide, shared by every copy of the
 * package loaded in the process, and never removed.
 *
 * @param provider - The `provider` block of a verbatra config.
 */
export function declareProviderKeyEnvVar(provider: ProviderConfig): void {
  if (provider.id === "openai-compatible" && provider.options.apiKeyEnvVar !== undefined) {
    declareKeyEnvVar(provider.options.apiKeyEnvVar);
  }
}
