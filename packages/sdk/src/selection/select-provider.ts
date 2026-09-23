import type { TranslationProvider } from "@verbatra/ai-providers";
import {
  buildProvider,
  isMachineProvider,
  machineTranslationDisabledError,
  type ProviderConfig,
} from "../config/provider-config.js";
import { errorMessage, SdkError } from "../errors.js";

/**
 * Builds a {@link TranslationProvider} from the config's `provider` block. Passed as
 * `deps.createProvider` to {@link translate}, {@link watch}, and {@link retranslateEntry}, it is the
 * seam for injecting a stub in a test or a provider the SDK does not ship.
 *
 * The default implementation dispatches on the provider ID and reads the API key from the
 * environment. A factory that throws is reported as `PROVIDER_CONSTRUCTION_FAILED`. It is never
 * called for a config whose provider is `none`: that is refused as `MACHINE_TRANSLATION_DISABLED`
 * before any factory runs.
 */
export type CreateProvider = (config: ProviderConfig) => TranslationProvider;

export function selectProvider(
  config: ProviderConfig,
  createProvider: CreateProvider = buildProvider,
  action = "calling a translation provider",
): TranslationProvider {
  if (!isMachineProvider(config)) {
    throw machineTranslationDisabledError(action);
  }
  try {
    return createProvider(config);
  } catch (error) {
    const detail = errorMessage(error);
    throw new SdkError(
      "PROVIDER_CONSTRUCTION_FAILED",
      `Failed to construct provider "${config.id}": ${detail}`,
    );
  }
}
