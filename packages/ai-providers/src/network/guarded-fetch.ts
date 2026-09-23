import { AsyncLocalStorage } from "node:async_hooks";
import { lookup } from "node:dns/promises";
import {
  describeRule,
  findRefusingRule,
  judgeHost,
  type NetworkPolicy,
  type NetworkRule,
} from "./policy.js";

/** The shape of the global `fetch`. */
export type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

/** Resolves a host name to every address it answers with. */
export type LookupAddresses = (hostname: string) => Promise<readonly string[]>;

/** Overrides for the policy-checking fetch, for tests. */
export interface GuardedFetchDeps {
  /** Sends a checked request. Defaults to the global `fetch`. */
  readonly fetch?: FetchLike;
  /** Resolves a host name before it is checked. Defaults to `dns.lookup` with every address. */
  readonly lookup?: LookupAddresses;
}

export interface GuardedFetch {
  readonly fetch: FetchLike;
  readonly run: <T>(call: () => Promise<T>) => Promise<T>;
}

export const MAX_FOLLOWED_REDIRECTS = 5;

export const REFUSED_RESPONSE_STATUS = 400;

const FOLLOWED_REDIRECT_STATUSES: ReadonlySet<number> = new Set([307, 308]);

const REDIRECT_STATUSES: ReadonlySet<number> = new Set([301, 302, 303, 307, 308]);

export class NetworkPolicyViolation extends Error {
  readonly host: string;

  constructor(host: string, message: string) {
    super(message);
    this.name = "NetworkPolicyViolation";
    this.host = host;
  }
}

interface CallSlot {
  violation?: NetworkPolicyViolation;
}

const defaultFetch: FetchLike = (input, init) => fetch(input, init);

const defaultLookup: LookupAddresses = async (hostname) =>
  (await lookup(hostname, { all: true, verbatim: true })).map((entry) => entry.address);

function blocked(host: string, detail: string): NetworkPolicyViolation {
  return new NetworkPolicyViolation(host, `The request to ${host} was blocked: ${detail}.`);
}

function refusal(host: string, rule: NetworkRule, subject: string): NetworkPolicyViolation {
  return blocked(host, `${subject} is not permitted by ${describeRule(rule)}`);
}

async function checkUrl(
  policy: NetworkPolicy,
  url: URL,
  resolve: LookupAddresses,
): Promise<NetworkPolicyViolation | undefined> {
  const judgement = judgeHost(policy, url.hostname);
  if (judgement.refusedBy !== undefined) {
    return refusal(url.host, judgement.refusedBy, "this host");
  }
  if (judgement.verdict !== "resolve") {
    return undefined;
  }
  const refusedBy = findRefusingRule(judgement.resolveFor, await resolve(url.hostname));
  return refusedBy === undefined
    ? undefined
    : refusal(url.host, refusedBy, "an address this host resolves to");
}

function requestUrl(input: string | URL | Request): URL {
  return new URL(input instanceof Request ? input.url : input);
}

type RedirectStep =
  | { readonly kind: "none" }
  | { readonly kind: "follow"; readonly next: URL }
  | { readonly kind: "refuse"; readonly violation: NetworkPolicyViolation };

function parseLocation(location: string, current: URL): URL | undefined {
  try {
    return new URL(location, current);
  } catch {
    return undefined;
  }
}

function redirectStep(response: Response, current: URL, followable: boolean): RedirectStep {
  const location = response.headers.get("location");
  if (!REDIRECT_STATUSES.has(response.status) || location === null) {
    return { kind: "none" };
  }
  const next = parseLocation(location, current);
  if (next === undefined) {
    return {
      kind: "refuse",
      violation: blocked(
        current.host,
        "it redirected to a location that is not a valid URL, so its origin cannot be checked",
      ),
    };
  }
  if (next.origin !== current.origin) {
    return {
      kind: "refuse",
      violation: blocked(
        current.host,
        `it redirected to ${next.host}, and a restrictive network policy follows no redirect to another origin`,
      ),
    };
  }
  return followable && FOLLOWED_REDIRECT_STATUSES.has(response.status)
    ? { kind: "follow", next }
    : { kind: "none" };
}

function refusedResponse(violation: NetworkPolicyViolation): Response {
  return new Response(
    JSON.stringify({ error: { type: "network_policy_violation", message: violation.message } }),
    {
      status: REFUSED_RESPONSE_STATUS,
      headers: { "content-type": "application/json", "x-should-retry": "false" },
    },
  );
}

export function createGuardedFetch(
  policy: NetworkPolicy,
  deps: GuardedFetchDeps = {},
): GuardedFetch {
  const send = deps.fetch ?? defaultFetch;
  const resolve = deps.lookup ?? defaultLookup;
  const calls = new AsyncLocalStorage<CallSlot>();

  function refuse(violation: NetworkPolicyViolation): Response {
    const slot = calls.getStore();
    if (slot === undefined) {
      throw violation;
    }
    slot.violation = violation;
    return refusedResponse(violation);
  }

  const guardedFetch: FetchLike = async (input, init) => {
    let url = requestUrl(input);
    let target: string | URL | Request = input;
    for (let hop = 0; ; hop += 1) {
      const violation = await checkUrl(policy, url, resolve);
      if (violation !== undefined) {
        return refuse(violation);
      }
      const response = await send(target, { ...init, redirect: "manual" });
      const followable = !(input instanceof Request) && hop < MAX_FOLLOWED_REDIRECTS;
      const step = redirectStep(response, url, followable);
      if (step.kind === "none") {
        return response;
      }
      await response.body?.cancel();
      if (step.kind === "refuse") {
        return refuse(step.violation);
      }
      url = step.next;
      target = step.next.href;
    }
  };

  const run = async <T>(call: () => Promise<T>): Promise<T> => {
    const slot: CallSlot = {};
    try {
      const result = await calls.run(slot, call);
      if (slot.violation !== undefined) {
        throw slot.violation;
      }
      return result;
    } catch (error) {
      throw slot.violation ?? error;
    }
  };

  return { fetch: guardedFetch, run };
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
