import {
  type EndpointJudgement,
  type EndpointTarget,
  type EnvironmentSource,
  judgeProviderEndpoint,
  type NetworkConfig,
  type NetworkPolicy,
  type NetworkRule,
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
    : { source: "config", policy: network.policy, allowedHosts: network.allowedHosts ?? [] };
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

export function endpointTargetOf(provider: MachineProviderConfig): EndpointTarget {
  return provider.id === "openai-compatible"
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

export function assertEndpointPermitted(
  provider: MachineProviderConfig,
  policy: NetworkPolicy,
  env: EnvironmentSource,
): void {
  const judgement = judgeConfiguredEndpoint(provider, policy, env);
  if (judgement.kind === "refused") {
    throw new SdkError(
      "NETWORK_POLICY_VIOLATION",
      `Provider "${provider.id}" was not constructed: ${judgement.reason}. No request was sent. ` +
        "Point the provider at a permitted host, or add its host to network.allowedHosts.",
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
