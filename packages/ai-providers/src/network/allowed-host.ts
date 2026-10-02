import { isIPv4, isIPv6 } from "node:net";

export type AllowedHost =
  | { readonly kind: "name"; readonly name: string }
  | { readonly kind: "suffix"; readonly suffix: string }
  | {
      readonly kind: "subnet";
      readonly address: string;
      readonly prefix: number;
      readonly family: "ipv4" | "ipv6";
    };

const HOST_LABEL = "[a-zA-Z0-9_](?:[a-zA-Z0-9_-]*[a-zA-Z0-9_])?";

const HOST_NAME = `${HOST_LABEL}(?:\\.${HOST_LABEL})*`;

const WILDCARD = `\\*\\.${HOST_LABEL}(?:\\.${HOST_LABEL})+`;

const IPV6_LITERAL = "[0-9a-fA-F.]*:[0-9a-fA-F:.]*(?:/\\d{1,3})?";

const IPV4_LITERAL = "\\d{1,3}(?:\\.\\d{1,3}){3}(?:/\\d{1,2})?";

export const ALLOWED_HOST_PATTERN = new RegExp(
  `^(?:(?:${WILDCARD}|${HOST_NAME})\\.?|${IPV6_LITERAL}|${IPV4_LITERAL})$`,
);

const IPV4_SHAPE = /^\d+(?:\.\d+)*$/;

export function normalizeHostName(name: string): string {
  const lower = name.toLowerCase();
  return lower.endsWith(".") ? lower.slice(0, -1) : lower;
}

export function canonicalIpv6(address: string): string {
  return new URL(`http://[${address}]/`).hostname.slice(1, -1);
}

function parsePrefix(raw: string | undefined, max: number): number | undefined {
  if (raw === undefined) {
    return max;
  }
  const prefix = Number(raw);
  return prefix <= max ? prefix : undefined;
}

function parseSubnet(entry: string): AllowedHost | undefined {
  const [address = "", rawPrefix] = entry.split("/");
  if (isIPv4(address)) {
    const prefix = parsePrefix(rawPrefix, 32);
    return prefix === undefined ? undefined : { kind: "subnet", address, prefix, family: "ipv4" };
  }
  if (isIPv6(address)) {
    const prefix = parsePrefix(rawPrefix, 128);
    return prefix === undefined
      ? undefined
      : { kind: "subnet", address: canonicalIpv6(address), prefix, family: "ipv6" };
  }
  return undefined;
}

export function parseAllowedHost(entry: string): AllowedHost | undefined {
  if (!ALLOWED_HOST_PATTERN.test(entry)) {
    return undefined;
  }
  if (entry.includes(":") || entry.includes("/") || IPV4_SHAPE.test(entry)) {
    return parseSubnet(entry);
  }
  const name = normalizeHostName(entry);
  return name.startsWith("*.") ? { kind: "suffix", suffix: name.slice(1) } : { kind: "name", name };
}

export function isValidAllowedHost(entry: string): boolean {
  return parseAllowedHost(entry) !== undefined;
}
