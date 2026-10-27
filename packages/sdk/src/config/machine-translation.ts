import { isMachineProvider, machineTranslationDisabledError } from "./provider-config.js";
import type { VerbatraConfig } from "./schema.js";

/**
 * Whether a config allows machine translation at all. False exactly when the config sets
 * `provider: { id: "none" }`, the human-only mode in which no provider is ever constructed and no
 * API key is read.
 *
 * A surface that offers provider-spending actions, such as a dashboard or an agent tool server,
 * reads this to leave those actions out altogether rather than advertise something that can only
 * fail.
 *
 * @param config - The resolved config, or any object carrying its `provider` block.
 * @returns True when a translation provider is configured, false in human-only mode.
 *
 * @example
 * ```ts
 * import { isMachineTranslationEnabled, loadConfig } from "@verbatra/sdk";
 *
 * declare const allowSpend: boolean;
 *
 * const config = await loadConfig();
 * const offerRetranslate = allowSpend && isMachineTranslationEnabled(config);
 * ```
 */
export function isMachineTranslationEnabled(config: Pick<VerbatraConfig, "provider">): boolean {
  return isMachineProvider(config.provider);
}

/**
 * Refuses a provider-spending action when the config disables machine translation. It returns
 * nothing when a provider is configured, and throws otherwise, so a caller wrapping
 * {@link translate} for an explicit "translate everything pending" action can fail with the same
 * structured error {@link retranslateEntry} raises instead of silently filling from the translation
 * memory alone.
 *
 * @param config - The resolved config, or any object carrying its `provider` block.
 * @param action - A short phrase naming the refused action, used in the error message.
 *
 * @throws {@link SdkError} `MACHINE_TRANSLATION_DISABLED`: the config sets `provider: { id: "none" }`.
 *
 * @example
 * ```ts
 * import { assertMachineTranslationEnabled, loadConfig, translate } from "@verbatra/sdk";
 *
 * const config = await loadConfig();
 * assertMachineTranslationEnabled(config, "translating every pending key");
 * const summary = await translate({ config });
 * ```
 */
export function assertMachineTranslationEnabled(
  config: Pick<VerbatraConfig, "provider">,
  action: string,
): void {
  if (!isMachineProvider(config.provider)) {
    throw machineTranslationDisabledError(action);
  }
}
