import {
  type EndpointJudgement,
  type EnvironmentSource,
  isRestrictive,
  NETWORK_POLICY_ENV_VAR,
  type NetworkConfig,
  type NetworkPolicy,
  type NetworkRuleSource,
} from "@verbatra/ai-providers";
import { judgeConfiguredEndpoint, resolveNetworkPolicy } from "../config/network-policy.js";
import {
  hasProviderFactory,
  isMachineProvider,
  type ProviderConfig,
} from "../config/provider-config.js";
import { errorMessage } from "../errors.js";

export interface NetworkVerdict {
  readonly passed: boolean;
  readonly detail: string;
}

function ruleLabel(policy: NetworkPolicy, source: NetworkRuleSource): string {
  const rule = policy.rules.find((entry) => entry.source === source);
  if (rule === undefined) {
    return "unset";
  }
  return rule.allowedHosts.length === 0
    ? rule.policy
    : `${rule.policy}, allowing ${rule.allowedHosts.join(", ")}`;
}

function describePolicy(policy: NetworkPolicy): string {
  const effective = isRestrictive(policy)
    ? "restricted: a host must satisfy every policy below"
    : "any host";
  return `${effective} (config: ${ruleLabel(policy, "config")}; ${NETWORK_POLICY_ENV_VAR}: ${ruleLabel(policy, "environment")}).`;
}

function describeEndpoint(providerId: string, judgement: EndpointJudgement): string {
  const origin =
    judgement.endpoint.overriddenBy === undefined
      ? ""
      : ` (from ${judgement.endpoint.overriddenBy})`;
  return `Provider "${providerId}" connects to ${judgement.host}${origin}`;
}

function describeOutcome(judgement: EndpointJudgement, restricted: boolean): string {
  if (judgement.kind === "refused") {
    return `refused: ${judgement.reason}. translate, watch and retranslate stop before any request.`;
  }
  if (!restricted) {
    return "permitted.";
  }
  if (judgement.deferred) {
    return "permitted if every address the name resolves to is, which is checked before each request.";
  }
  return judgement.endpoint.transport === "axios"
    ? "permitted. Its requests are checked against the policy only before the provider is built, not per request."
    : "permitted. Every request and redirect is checked against the policy again.";
}

export type NetworkAssessment =
  | { readonly kind: "resolved"; readonly policy: NetworkPolicy }
  | { readonly kind: "invalid"; readonly error: string };

export function assessNetworkPolicy(
  network: NetworkConfig | undefined,
  env: EnvironmentSource,
): NetworkAssessment {
  try {
    return { kind: "resolved", policy: resolveNetworkPolicy(network, env) };
  } catch (error) {
    return { kind: "invalid", error: errorMessage(error) };
  }
}

export function checkNetworkPolicy(
  provider: ProviderConfig,
  network: NetworkConfig | undefined,
  env: EnvironmentSource,
): NetworkVerdict {
  const assessment = assessNetworkPolicy(network, env);
  if (assessment.kind === "invalid") {
    return { passed: false, detail: assessment.error };
  }
  const policy = assessment.policy;
  const summary = describePolicy(policy);
  if (!isMachineProvider(provider)) {
    return { passed: true, detail: `${summary} No provider is called (provider "none").` };
  }
  if (!hasProviderFactory(provider.id)) {
    return {
      passed: false,
      detail: `${summary} Provider "${provider.id}" is unknown, so its endpoint cannot be checked.`,
    };
  }
  const judgement = judgeConfiguredEndpoint(provider, policy, env);
  return {
    passed: judgement.kind === "permitted",
    detail: `${summary} ${describeEndpoint(provider.id, judgement)}: ${describeOutcome(judgement, isRestrictive(policy))}`,
  };
}
