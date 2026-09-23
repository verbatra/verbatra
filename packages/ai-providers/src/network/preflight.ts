import {
  type EndpointTarget,
  type ProviderEndpoint,
  proxiesInEffect,
  resolveProviderEndpoint,
} from "./endpoints.js";
import type { EnvironmentSource } from "./environment-rule.js";
import { describeRule, isRestrictive, judgeHost, type NetworkPolicy } from "./policy.js";

export type EndpointJudgement =
  | {
      readonly kind: "permitted";
      readonly endpoint: ProviderEndpoint;
      readonly host: string;
      readonly deferred: boolean;
    }
  | {
      readonly kind: "refused";
      readonly endpoint: ProviderEndpoint;
      readonly host: string;
      readonly reason: string;
    };

export const UNPARSEABLE_HOST = "(unparseable URL)";

function hostOf(url: string): string | undefined {
  try {
    const { hostname } = new URL(url);
    return hostname.length === 0 ? undefined : hostname;
  } catch {
    return undefined;
  }
}

type HostCheck = { readonly refused?: string; readonly deferred: boolean };

function checkHost(
  policy: NetworkPolicy,
  host: string,
  knownPublic: boolean,
  label: string,
): HostCheck {
  const judgement = judgeHost(policy, host, knownPublic);
  if (judgement.refusedBy !== undefined) {
    return {
      refused: `${label} is not permitted by ${describeRule(judgement.refusedBy)}`,
      deferred: false,
    };
  }
  return { deferred: judgement.verdict === "resolve" };
}

function checkProxies(
  policy: NetworkPolicy,
  endpoint: ProviderEndpoint,
  env: EnvironmentSource,
): string | undefined {
  for (const proxy of proxiesInEffect(endpoint.transport, env)) {
    if (proxy.host === undefined) {
      return `the proxy in ${proxy.variable} could not be parsed, so its host cannot be checked`;
    }
    const label = `the proxy host ${proxy.host} from ${proxy.variable}`;
    const check = checkHost(policy, proxy.host, false, label);
    if (check.refused !== undefined || check.deferred) {
      return (
        check.refused ??
        `${label} must be an address or a host name listed in allowedHosts, because a proxy host is not resolved and checked per request`
      );
    }
  }
  return undefined;
}

export function judgeProviderEndpoint(
  policy: NetworkPolicy,
  target: EndpointTarget,
  env: EnvironmentSource,
): EndpointJudgement {
  const endpoint = resolveProviderEndpoint(target, env);
  const parsedHost = hostOf(endpoint.url);
  const host = parsedHost ?? UNPARSEABLE_HOST;
  if (!isRestrictive(policy)) {
    return { kind: "permitted", endpoint, host, deferred: false };
  }
  if (endpoint.unsupported !== undefined) {
    return { kind: "refused", endpoint, host, reason: endpoint.unsupported };
  }
  if (parsedHost === undefined) {
    return {
      kind: "refused",
      endpoint,
      host,
      reason: `the endpoint URL from ${endpoint.overriddenBy ?? "the config"} could not be parsed, so its host cannot be checked`,
    };
  }
  const check = checkHost(policy, host, endpoint.knownPublic, `the endpoint host ${host}`);
  const refused = check.refused ?? checkProxies(policy, endpoint, env);
  return refused === undefined
    ? { kind: "permitted", endpoint, host, deferred: check.deferred }
    : { kind: "refused", endpoint, host, reason: refused };
}
