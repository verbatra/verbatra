import {
  type EnvironmentSource,
  isRestrictive,
  type NetworkConfig,
  type ProviderNetwork,
  type ProviderRetryListener,
  processEnvironment,
  type TranslationProvider,
} from "@verbatra/ai-providers";
import { assertEndpointPermitted, resolveNetworkPolicy } from "../config/network-policy.js";
import {
  buildProvider,
  isMachineProvider,
  machineTranslationDisabledError,
  type ProviderConfig,
} from "../config/provider-config.js";
import { errorMessage, SdkError } from "../errors.js";
import type { ProgressEvent } from "../progress/types.js";
import { redact } from "../redact.js";
import type { SensitiveGuard } from "../sensitive/guard.js";
import { guardProvider } from "../sensitive/guarded-provider.js";

/**
 * What the SDK hands a {@link CreateProvider} besides the `provider` block. It is passed only when
 * the effective network policy restricts where a provider may connect; under the default `any`
 * policy the factory is called with the config alone.
 */
export interface CreateProviderContext {
  /**
   * The effective network policy, merged from the config's `network` block and the
   * `VERBATRA_NETWORK_POLICY` environment variable, with the environment it was read from. The
   * built-in providers use it to pin their endpoint and check every request, including each
   * redirect, against the policy. A custom factory may ignore it, but then only the static check
   * the SDK runs before calling the factory applies to its requests.
   */
  readonly network: ProviderNetwork;
}

/**
 * Builds a {@link TranslationProvider} from the config's `provider` block. Passed as
 * `deps.createProvider` to {@link translate}, {@link watch}, and {@link retranslateEntry}, it is the
 * seam for injecting a stub in a test or a provider the SDK does not ship.
 *
 * The default implementation dispatches on the provider ID and reads the API key from the
 * environment. A factory that throws is reported as `PROVIDER_CONSTRUCTION_FAILED`, whose message
 * redacts the thrown error's message and whose `cause` is the thrown error itself, not redacted, so a
 * factory you supply should keep secrets out of what it throws. It is never
 * called for a config whose provider is `none`: that is refused as `MACHINE_TRANSLATION_DISABLED`
 * before any factory runs. Nor is it called when the network policy refuses the provider's
 * endpoint: that is refused as `NETWORK_POLICY_VIOLATION` before any API key is read.
 *
 * When the config's `sensitiveData.mode` is `block` or `redact`, the SDK wraps the provider the
 * factory returns: a withheld key never reaches it, a glossary term with a match is left out of the
 * request, and under `redact` each match in a value arrives as a token such as `__VBR0__`, listed
 * in the entry's `placeholders`, that the SDK restores in the result.
 */
export type CreateProvider = (
  config: ProviderConfig,
  context?: CreateProviderContext,
  hooks?: CreateProviderHooks,
) => TranslationProvider;

/**
 * Listeners the SDK hands a {@link CreateProvider} as its third argument, only when a run reports
 * progress. A custom factory may ignore them.
 */
export interface CreateProviderHooks {
  /**
   * Called for each retry the built-in providers make of a request that failed with a retryable
   * status. {@link translate} and {@link watch} report each call as a `provider-retry`
   * {@link ProgressEvent}.
   */
  readonly onRetry?: ProviderRetryListener;
}

export interface SelectProviderNetwork {
  readonly network: NetworkConfig | undefined;
  readonly env?: EnvironmentSource;
  readonly hooks?: CreateProviderHooks;
  readonly sensitive?: SensitiveGuard;
}

function construct(
  config: ProviderConfig,
  createProvider: CreateProvider,
  context: CreateProviderContext | undefined,
  hooks: CreateProviderHooks | undefined,
): TranslationProvider {
  try {
    if (hooks !== undefined) {
      return createProvider(config, context, hooks);
    }
    return context === undefined ? createProvider(config) : createProvider(config, context);
  } catch (error) {
    throw new SdkError(
      "PROVIDER_CONSTRUCTION_FAILED",
      `Failed to construct provider "${config.id}": ${redact(errorMessage(error))}`,
      { cause: error },
    );
  }
}

export function selectProvider(
  config: ProviderConfig,
  createProvider: CreateProvider = buildProvider,
  selection: SelectProviderNetwork = { network: undefined },
): TranslationProvider {
  if (!isMachineProvider(config)) {
    throw machineTranslationDisabledError("calling a translation provider");
  }
  const env = selection.env ?? processEnvironment();
  const policy = resolveNetworkPolicy(selection.network, env);
  assertEndpointPermitted(config, policy, env);
  const context = isRestrictive(policy) ? { network: { policy, env } } : undefined;
  const provider = construct(config, createProvider, context, selection.hooks);
  return selection.sensitive === undefined
    ? provider
    : guardProvider(provider, selection.sensitive);
}
