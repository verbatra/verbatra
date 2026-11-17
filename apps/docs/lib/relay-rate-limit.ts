import { isIPv6 } from "node:net";
import { ipv6Hextets } from "@/lib/server-pageview";

export const RATE_WINDOW_MS = 60_000;

export const IP_LIMIT_PER_WINDOW = 60;

export const GLOBAL_LIMIT_PER_WINDOW = 3000;

export const MAX_TRACKED_IPS = 10_000;

interface Window {
  start: number;
  count: number;
}

interface Limits {
  readonly globalLimit?: number;
}

const IPV6_PREFIX_HEXTETS = 4;
const IPV4_MAPPED_HEXTET = 0xffff;

export function rateKeyOf(ip: string): string {
  if (!isIPv6(ip)) return ip;
  const hextets = ipv6Hextets(ip.split("%")[0] ?? ip);
  const mapped =
    hextets.slice(0, 5).every((hextet) => hextet === 0) && hextets[5] === IPV4_MAPPED_HEXTET;
  if (mapped) {
    const [high = 0, low = 0] = hextets.slice(6);
    return `${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`;
  }
  return `${hextets
    .slice(0, IPV6_PREFIX_HEXTETS)
    .map((hextet) => hextet.toString(16))
    .join(":")}::/64`;
}

export type RelayRateLimit = (ip: string, now?: number) => boolean;

export function createRelayRateLimit({
  globalLimit = GLOBAL_LIMIT_PER_WINDOW,
}: Limits = {}): RelayRateLimit {
  const windows = new Map<string, Window>();
  const total: Window = { start: 0, count: 0 };

  function reclaimExpired(now: number): void {
    for (const [ip, window] of windows) {
      if (now - window.start >= RATE_WINDOW_MS) windows.delete(ip);
    }
  }

  function windowFor(ip: string, now: number): Window | undefined {
    const existing = windows.get(ip);
    if (existing !== undefined && now - existing.start < RATE_WINDOW_MS) return existing;
    if (existing === undefined && windows.size >= MAX_TRACKED_IPS) reclaimExpired(now);
    if (existing === undefined && windows.size >= MAX_TRACKED_IPS) return undefined;
    const fresh = { start: now, count: 0 };
    windows.set(ip, fresh);
    return fresh;
  }

  return (ip, now = Date.now()) => {
    if (now - total.start >= RATE_WINDOW_MS) {
      total.start = now;
      total.count = 0;
      reclaimExpired(now);
    }
    if (total.count >= globalLimit) return false;
    const window = windowFor(rateKeyOf(ip), now);
    if (window === undefined || window.count >= IP_LIMIT_PER_WINDOW) return false;
    window.count += 1;
    total.count += 1;
    return true;
  };
}
