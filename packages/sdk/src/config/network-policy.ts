import {
  type EndpointJudgement,
  type EndpointTarget,
  type EnvironmentSource,
  judgeProviderEndpoint,
  NETWORK_ALLOWED_HOSTS_ENV_VAR,
  type NetworkConfig,
  type NetworkPolicy,
  type NetworkRule,
  type NetworkRuleSource,
  processEnvironment,
  readEnvironmentRule,
} from "@verbatra/ai-providers";
import { SdkError } from "../errors.js";
import {
  isMachineProvider,
  type MachineProviderConfig,
  type ProviderConfig,
} from "./provider-config.js";

function configRule(network: NetworkConfig | undefined): NetworkRule | undefined {
  return network === undefined
    ? undefined
    : { source: "config", policy: network.policy, allowedHosts: [...(network.allowedHosts ?? [])] };
}

export function resolveNetworkPolicy(
  network: NetworkConfig | undefined,
  env: EnvironmentSource,
): NetworkPolicy {
  const fromEnvironment = readEnvironmentRule(env);
  if (fromEnvironment.kind === "invalid") {
    throw new SdkError("CONFIG_INVALID", fromEnvironment.message);
  }
  const rules = [
    configRule(network),
    fromEnvironment.kind === "rule" ? fromEnvironment.rule : undefined,
  ].filter((rule): rule is NetworkRule => rule !== undefined);
  return { rules };
}

export function assertNetworkPolicyResolves(
  network: NetworkConfig | undefined,
  env: EnvironmentSource,
): void {
  resolveNetworkPolicy(network, env);
}

export function endpointTargetOf(provider: MachineProviderConfig): EndpointTarget {
  return provider.id === "openai-compatible" || provider.id === "libretranslate"
    ? { id: provider.id, baseUrl: provider.options.baseUrl }
    : { id: provider.id };
}

export function judgeConfiguredEndpoint(
  provider: MachineProviderConfig,
  policy: NetworkPolicy,
  env: EnvironmentSource,
): EndpointJudgement {
  return judgeProviderEndpoint(policy, endpointTargetOf(provider), env);
}

const ALLOWLIST_BY_SOURCE: Readonly<Record<NetworkRuleSource, string>> = {
  config: "network.allowedHosts",
  environment: NETWORK_ALLOWED_HOSTS_ENV_VAR,
};

function allowlistsToExtend(
  refusedBy: NetworkRuleSource | undefined,
  policy: NetworkPolicy,
): readonly string[] {
  const sources = refusedBy === undefined ? policy.rules.map((rule) => rule.source) : [refusedBy];
  return [...new Set(sources)].map((source) => ALLOWLIST_BY_SOURCE[source]);
}

export function assertEndpointPermitted(
  provider: MachineProviderConfig,
  policy: NetworkPolicy,
  env: EnvironmentSource,
): void {
  const judgement = judgeConfiguredEndpoint(provider, policy, env);
  if (judgement.kind === "refused") {
    const allowlists = allowlistsToExtend(judgement.refusedBy, policy);
    throw new SdkError(
      "NETWORK_POLICY_VIOLATION",
      `Provider "${provider.id}" was not constructed: ${judgement.reason}. No request was sent. ` +
        `Point the provider at a permitted host, or add its host to ${allowlists.join(" and ")}.`,
    );
  }
}

export function assertProviderNetworkPermitted(
  config: { readonly provider: ProviderConfig; readonly network?: NetworkConfig | undefined },
  env: EnvironmentSource = processEnvironment(),
): void {
  if (isMachineProvider(config.provider)) {
    assertEndpointPermitted(config.provider, resolveNetworkPolicy(config.network, env), env);
  }
}
