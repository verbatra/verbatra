import { BlockList, isIPv4, isIPv6 } from "node:net";
import {
  type AllowedHost,
  canonicalIpv6,
  normalizeHostName,
  parseAllowedHost,
} from "./allowed-host.js";
import { NETWORK_POLICY_ENV_VAR } from "./environment-rule.js";
import type { NetworkPolicyMode } from "./network-config.js";

/** Where a {@link NetworkRule} came from: the config's `network` block or `VERBATRA_NETWORK_POLICY`. */
export type NetworkRuleSource = "config" | "environment";

/** One source's network policy. */
export interface NetworkRule {
  /** Where the rule was set. */
  readonly source: NetworkRuleSource;
  /** The policy that source sets. */
  readonly policy: NetworkPolicyMode;
  /** Host names, `*.suffix` wildcards, IP addresses, or CIDR ranges the source also permits. */
  readonly allowedHosts: readonly string[];
}

/** The effective network policy: a host is permitted only when every rule permits it. */
export interface NetworkPolicy {
  /** The rules from each source that sets one. No rule means every host is permitted. */
  readonly rules: readonly NetworkRule[];
}

export type HostVerdict = "permitted" | "refused" | "resolve";

type RuleVerdict = HostVerdict | "resolve-loopback";

export interface ResolveRequirement {
  readonly rule: NetworkRule;
  readonly loopbackOnly: boolean;
}

export interface HostJudgement {
  readonly verdict: HostVerdict;
  readonly refusedBy?: NetworkRule;
  readonly resolveFor: readonly ResolveRequirement[];
}

type Address = { readonly address: string; readonly family: "ipv4" | "ipv6" };

type ParsedHost = { readonly kind: "name"; readonly name: string } | (Address & { kind: "ip" });

const LOCAL_SUBNETS: readonly Address[] = [
  { address: "127.0.0.0/8", family: "ipv4" },
  { address: "10.0.0.0/8", family: "ipv4" },
  { address: "172.16.0.0/12", family: "ipv4" },
  { address: "192.168.0.0/16", family: "ipv4" },
  { address: "::1/128", family: "ipv6" },
  { address: "fc00::/7", family: "ipv6" },
];

const LOCAL_ADDRESSES = new BlockList();
for (const subnet of LOCAL_SUBNETS) {
  const [address = "", prefix = ""] = subnet.address.split("/");
  LOCAL_ADDRESSES.addSubnet(address, Number(prefix), subnet.family);
}

const LOOPBACK_ADDRESSES = new BlockList();
LOOPBACK_ADDRESSES.addSubnet("127.0.0.0", 8, "ipv4");
LOOPBACK_ADDRESSES.addAddress("::1", "ipv6");

const MAPPED_HEX = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/;

function hexPairToIpv4(high: string, low: string): string {
  const value = (Number.parseInt(high, 16) << 16) | Number.parseInt(low, 16);
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 0xff).join(".");
}

function withoutZone(address: string): string {
  const zone = address.indexOf("%");
  return zone === -1 ? address : address.slice(0, zone);
}

export function toAddress(raw: string): Address | undefined {
  const bare = withoutZone(raw.startsWith("[") && raw.endsWith("]") ? raw.slice(1, -1) : raw);
  if (isIPv4(bare)) {
    return { address: bare, family: "ipv4" };
  }
  if (!isIPv6(bare)) {
    return undefined;
  }
  const canonical = canonicalIpv6(bare);
  const hex = MAPPED_HEX.exec(canonical);
  if (hex?.[1] !== undefined && hex[2] !== undefined) {
    return { address: hexPairToIpv4(hex[1], hex[2]), family: "ipv4" };
  }
  return { address: canonical, family: "ipv6" };
}

function parseHost(hostname: string): ParsedHost {
  const address = toAddress(hostname);
  return address === undefined
    ? { kind: "name", name: normalizeHostName(hostname) }
    : { kind: "ip", ...address };
}

export function isLocalAddress(address: Address): boolean {
  return LOCAL_ADDRESSES.check(address.address, address.family);
}

function isLoopbackAddress(address: Address): boolean {
  return LOOPBACK_ADDRESSES.check(address.address, address.family);
}

function isLocalName(name: string): boolean {
  return name === "localhost" || name.endsWith(".localhost");
}

interface CompiledRule {
  readonly rule: NetworkRule;
  readonly entries: readonly AllowedHost[];
  readonly subnets: BlockList;
  readonly hasSubnets: boolean;
}

const compiledRules = new WeakMap<NetworkRule, CompiledRule>();

function compileRule(rule: NetworkRule): CompiledRule {
  const cached = compiledRules.get(rule);
  if (cached !== undefined) {
    return cached;
  }
  const compiled = buildCompiledRule(rule);
  compiledRules.set(rule, compiled);
  return compiled;
}

function buildCompiledRule(rule: NetworkRule): CompiledRule {
  const entries = rule.allowedHosts
    .map(parseAllowedHost)
    .filter((entry): entry is AllowedHost => entry !== undefined);
  const subnets = new BlockList();
  let hasSubnets = false;
  for (const entry of entries) {
    if (entry.kind === "subnet") {
      subnets.addSubnet(entry.address, entry.prefix, entry.family);
      hasSubnets = true;
    }
  }
  return { rule, entries, subnets, hasSubnets };
}

function nameAllowed(compiled: CompiledRule, name: string): boolean {
  return compiled.entries.some(
    (entry) =>
      (entry.kind === "name" && entry.name === name) ||
      (entry.kind === "suffix" && name.endsWith(entry.suffix)),
  );
}

function addressAllowed(compiled: CompiledRule, address: Address): boolean {
  return (
    compiled.rule.policy === "any" ||
    compiled.subnets.check(address.address, address.family) ||
    (compiled.rule.policy === "local-only" && isLocalAddress(address))
  );
}

function judgeName(compiled: CompiledRule, name: string, knownPublic: boolean): RuleVerdict {
  if (nameAllowed(compiled, name)) {
    return "permitted";
  }
  if (compiled.rule.policy === "local-only" && isLocalName(name)) {
    return "resolve-loopback";
  }
  if (knownPublic || (compiled.rule.policy === "allowlist" && !compiled.hasSubnets)) {
    return "refused";
  }
  return "resolve";
}

function judgeUnderRule(
  compiled: CompiledRule,
  host: ParsedHost,
  knownPublic: boolean,
): RuleVerdict {
  if (compiled.rule.policy === "any") {
    return "permitted";
  }
  if (host.kind === "name") {
    return judgeName(compiled, host.name, knownPublic);
  }
  return addressAllowed(compiled, host) ? "permitted" : "refused";
}

export function isRestrictive(policy: NetworkPolicy): boolean {
  return policy.rules.some((rule) => rule.policy !== "any");
}

export function judgeHost(
  policy: NetworkPolicy,
  hostname: string,
  knownPublic = false,
): HostJudgement {
  const host = parseHost(hostname);
  const resolveFor: ResolveRequirement[] = [];
  for (const rule of policy.rules) {
    const verdict = judgeUnderRule(compileRule(rule), host, knownPublic);
    if (verdict === "refused") {
      return { verdict, refusedBy: rule, resolveFor: [] };
    }
    if (verdict !== "permitted") {
      resolveFor.push({ rule, loopbackOnly: verdict === "resolve-loopback" });
    }
  }
  return { verdict: resolveFor.length > 0 ? "resolve" : "permitted", resolveFor };
}

function satisfies(requirement: ResolveRequirement, address: Address): boolean {
  return requirement.loopbackOnly
    ? isLoopbackAddress(address)
    : addressAllowed(compileRule(requirement.rule), address);
}

export function findRefusingRule(
  requirements: readonly ResolveRequirement[],
  resolved: readonly string[],
): NetworkRule | undefined {
  const addresses = resolved
    .map(toAddress)
    .filter((address): address is Address => address !== undefined);
  const complete = addresses.length > 0 && addresses.length === resolved.length;
  return requirements.find(
    (requirement) => !complete || !addresses.every((address) => satisfies(requirement, address)),
  )?.rule;
}

export function describeRule(rule: NetworkRule): string {
  const origin = rule.source === "config" ? "the config's network block" : NETWORK_POLICY_ENV_VAR;
  return `the "${rule.policy}" network policy set by ${origin}`;
}
