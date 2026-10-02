import { observeSdkRetries, type ProviderRetryListener } from "../provider-retry.js";
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

export type RunCall = <T>(call: () => Promise<T>) => Promise<T>;

export interface ClientTransport<Options> {
  readonly options: Options;
  readonly run: RunCall;
}

export interface PinnedTransport {
  readonly baseUrl: string;
  readonly fetch: FetchLike;
  readonly run: RunCall;
}

const unrestricted: RunCall = (call) => call();

export function pinnedTransport(
  target: EndpointTarget,
  network: ProviderNetwork | undefined,
): PinnedTransport | undefined {
  if (network === undefined) {
    return undefined;
  }
  const guarded = createGuardedFetch(network.policy, network.deps);
  return {
    baseUrl: resolveProviderEndpoint(target, network.env).url,
    fetch: guarded.fetch,
    run: guarded.run,
  };
}

const platformFetch: FetchLike = (input, init) => globalThis.fetch(input, init);

export function openAiStyleTransport(
  target: EndpointTarget,
  network: ProviderNetwork | undefined,
  onRetry?: ProviderRetryListener,
): ClientTransport<{ baseURL?: string; fetch?: FetchLike }> {
  const pinned = pinnedTransport(target, network);
  const base: ClientTransport<{ baseURL?: string; fetch?: FetchLike }> =
    pinned === undefined
      ? { options: {}, run: unrestricted }
      : { options: { baseURL: pinned.baseUrl, fetch: pinned.fetch }, run: pinned.run };
  if (onRetry === undefined) {
    return base;
  }
  const fetch = observeSdkRetries(pinned?.fetch ?? platformFetch, onRetry);
  return { options: { ...base.options, fetch }, run: base.run };
}

export function geminiTransport(
  network: ProviderNetwork | undefined,
): ClientTransport<{ httpOptions?: { baseUrl: string; fetch: FetchLike } }> {
  const pinned = pinnedTransport({ id: "gemini" }, network);
  return pinned === undefined
    ? { options: {}, run: unrestricted }
    : {
        options: { httpOptions: { baseUrl: pinned.baseUrl, fetch: pinned.fetch } },
        run: pinned.run,
      };
}

export function fetchTransport(
  target: EndpointTarget,
  network: ProviderNetwork | undefined,
  fallback: FetchLike,
): ClientTransport<FetchLike> {
  const pinned = pinnedTransport(target, network);
  return pinned === undefined
    ? { options: fallback, run: unrestricted }
    : { options: pinned.fetch, run: pinned.run };
}
