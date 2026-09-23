import { lookup } from "node:dns/promises";
import {
  describeRule,
  findRefusingRule,
  judgeHost,
  type NetworkPolicy,
  type NetworkRule,
} from "./policy.js";

export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type LookupAddresses = (hostname: string) => Promise<readonly string[]>;

export interface GuardedFetchDeps {
  readonly fetch?: FetchLike;
  readonly lookup?: LookupAddresses;
}

export const MAX_FOLLOWED_REDIRECTS = 5;

const FOLLOWED_REDIRECT_STATUSES: ReadonlySet<number> = new Set([307, 308]);

export class NetworkPolicyViolation extends Error {
  readonly host: string;

  constructor(host: string, message: string) {
    super(message);
    this.name = "NetworkPolicyViolation";
    this.host = host;
  }
}

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

const defaultLookup: LookupAddresses = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

function refusal(host: string, rule: NetworkRule, detail: string): NetworkPolicyViolation {
  return new NetworkPolicyViolation(
    host,
    `The request to ${host} was blocked: ${detail} is not permitted by ${describeRule(rule)}.`,
  );
}

async function assertPermitted(
  policy: NetworkPolicy,
  url: URL,
  resolve: LookupAddresses,
): Promise<void> {
  const judgement = judgeHost(policy, url.hostname);
  if (judgement.refusedBy !== undefined) {
    throw refusal(url.host, judgement.refusedBy, "this host");
  }
  if (judgement.verdict !== "resolve") {
    return;
  }
  const addresses = await resolve(url.hostname);
  const refusedBy = findRefusingRule(judgement.resolveFor, addresses);
  if (refusedBy !== undefined) {
    throw refusal(url.host, refusedBy, "an address this host resolves to");
  }
}

function requestUrl(input: string | URL | Request): URL {
  return new URL(input instanceof Request ? input.url : input);
}

function followTarget(response: Response, current: URL): URL | undefined {
  if (!FOLLOWED_REDIRECT_STATUSES.has(response.status)) {
    return undefined;
  }
  const location = response.headers.get("location");
  return location === null ? undefined : new URL(location, current);
}

export function createGuardedFetch(policy: NetworkPolicy, deps: GuardedFetchDeps = {}): FetchLike {
  const send = deps.fetch ?? defaultFetch;
  const resolve = deps.lookup ?? defaultLookup;
  return async (input, init) => {
    let url = requestUrl(input);
    let target: string | URL | Request = input;
    for (let hop = 0; ; hop += 1) {
      await assertPermitted(policy, url, resolve);
      const response = await send(target, { ...init, redirect: "manual" });
      const next = input instanceof Request ? undefined : followTarget(response, url);
      if (next === undefined || hop >= MAX_FOLLOWED_REDIRECTS) {
        return response;
      }
      await response.body?.cancel();
      url = next;
      target = next.href;
    }
  };
}

export function findNetworkPolicyViolation(error: unknown): NetworkPolicyViolation | undefined {
  let current = error;
  for (let depth = 0; depth < 4 && current !== undefined; depth += 1) {
    if (current instanceof NetworkPolicyViolation) {
      return current;
    }
    current =
      typeof current === "object" && current !== null && "cause" in current
        ? (current as { readonly cause?: unknown }).cause
        : undefined;
  }
  return undefined;
}
