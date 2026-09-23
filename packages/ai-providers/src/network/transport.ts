import { type EndpointTarget, resolveProviderEndpoint } from "./endpoints.js";
import type { EnvironmentSource } from "./environment-rule.js";
import { createGuardedFetch, type FetchLike, type GuardedFetchDeps } from "./guarded-fetch.js";
import type { NetworkPolicy } from "./policy.js";

/** What a built-in provider needs to enforce the network policy on its own requests. */
export interface ProviderNetwork {
  /** The effective policy every request and redirect is checked against. */
  readonly policy: NetworkPolicy;
  /** The environment the provider's endpoint was resolved from, so it is pinned to that host. */
  readonly env: EnvironmentSource;
  /** Test overrides for sending and resolving. */
  readonly deps?: GuardedFetchDeps;
}

export interface PinnedTransport {
  readonly baseUrl: string;
  readonly fetch: FetchLike;
}

export function pinnedTransport(
  target: EndpointTarget,
  network: ProviderNetwork | undefined,
): PinnedTransport | undefined {
  if (network === undefined) {
    return undefined;
  }
  return {
    baseUrl: resolveProviderEndpoint(target, network.env).url,
    fetch: createGuardedFetch(network.policy, network.deps),
  };
}

export function openAiStyleTransport(
  target: EndpointTarget,
  network: ProviderNetwork | undefined,
): { baseURL?: string; fetch?: FetchLike } {
  const pinned = pinnedTransport(target, network);
  return pinned === undefined ? {} : { baseURL: pinned.baseUrl, fetch: pinned.fetch };
}

export function geminiTransport(network: ProviderNetwork | undefined): {
  httpOptions?: { baseUrl: string; fetch: FetchLike };
} {
  const pinned = pinnedTransport({ id: "gemini" }, network);
  return pinned === undefined
    ? {}
    : { httpOptions: { baseUrl: pinned.baseUrl, fetch: pinned.fetch } };
}
