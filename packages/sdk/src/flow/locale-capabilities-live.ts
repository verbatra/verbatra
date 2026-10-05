import {
  type EnvironmentSource,
  isRestrictive,
  type NetworkConfig,
  PROVIDER_ENV,
  type ProviderLanguageTable,
} from "@verbatra/ai-providers";
import { judgeConfiguredEndpoint, resolveNetworkPolicy } from "../config/network-policy.js";
import type { MachineProviderConfig } from "../config/provider-config.js";
import { languageSupportOf } from "../config/provider-languages.js";
import { describeError } from "../errors.js";
import type { LanguageTableRefresh } from "./locale-capabilities.js";

export interface LiveRefreshOutcome {
  readonly refresh: LanguageTableRefresh;
  readonly table?: ProviderLanguageTable;
}

function skipped(detail: string): LiveRefreshOutcome {
  return { refresh: { status: "skipped", detail } };
}

function failed(detail: string): LiveRefreshOutcome {
  return { refresh: { status: "failed", detail } };
}

function requiredKeyVariableOf(provider: MachineProviderConfig): string | undefined {
  return provider.id === "openai-compatible" || provider.id === "libretranslate"
    ? undefined
    : PROVIDER_ENV[provider.id];
}

function isSet(env: EnvironmentSource, name: string): boolean {
  const value = env[name];
  return value !== undefined && value.length > 0;
}

function failureDetail(error: unknown): string {
  const { code, message } = describeError(error, "PROVIDER_ERROR");
  return `The live language list could not be fetched [${code}]: ${message} The static table was used.`;
}

export async function refreshLanguageTable(
  provider: MachineProviderConfig,
  network: NetworkConfig | undefined,
  env: EnvironmentSource,
): Promise<LiveRefreshOutcome> {
  const support = languageSupportOf(provider);
  if (support.coverage === "open" || support.fetchLive === undefined) {
    return skipped(
      `Provider "${provider.id}" has no language list to fetch: it accepts any locale.`,
    );
  }
  const keyVariable = requiredKeyVariableOf(provider);
  if (keyVariable !== undefined && !isSet(env, keyVariable)) {
    return skipped(
      `${keyVariable} is not set, so no request was sent and the static table of ${support.table.version} was used.`,
    );
  }
  try {
    const policy = resolveNetworkPolicy(network, env);
    const judgement = judgeConfiguredEndpoint(provider, policy, env);
    if (judgement.kind === "refused") {
      return skipped(
        `The network policy refuses ${judgement.host} (${judgement.reason}), so no request was sent and the static table of ${support.table.version} was used.`,
      );
    }
    const table = await support.fetchLive(
      isRestrictive(policy) ? { network: { policy, env } } : {},
    );
    return {
      refresh: {
        status: "refreshed",
        detail: `Fetched ${table.languages.length} languages from ${judgement.host}; no translation quota was used.`,
      },
      table,
    };
  } catch (error) {
    return failed(failureDetail(error));
  }
}
