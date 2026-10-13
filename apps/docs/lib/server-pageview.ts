import "server-only";
import { isIPv4, isIPv6 } from "node:net";
import { loadBuiltScriptHashes } from "@/lib/csp-script-hashes";
import { MARKDOWN_SUFFIX } from "@/lib/markdown-route";
import type { ScriptHashesByRoute } from "@/lib/script-hashes-manifest.mjs";
import { SITE_HOST } from "@/lib/site";

export const UMAMI_ORIGIN = "https://umami.kreitz-webdev.de";

export const UMAMI_WEBSITE_ID = "fcf007b7-4579-4486-881c-e8686d61d63d";

export const ANALYTICS_OPT_OUT_COOKIE = "verbatra_analytics_optout";

export const PAGEVIEW_TIMEOUT_MS = 1500;

const UNCOUNTED_ROUTES: ReadonlySet<string> = new Set(["/_not-found", "/_global-error"]);

const AUTOMATED_AGENT =
  /bot\/|bot;|crawler|spider|headlesschrome|lighthouse|uptime|curl\/|wget\/|python-requests|go-http-client|^node$|^undici/i;

const MARKDOWN_ROUTE = /\.mdx?(\/|$)/;

const PRIVATE_IPV4_RANGES: ReadonlyArray<readonly [string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 3],
];

const NON_PUBLIC_IPV6_PREFIXES: ReadonlyArray<readonly [string, number]> = [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b::", 96],
  ["2001:db8::", 32],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
];

const IPV4_MAPPED_PREFIX = 0xffffn;

export const MAX_LANGUAGE_LENGTH = 35;

export const MAX_REFERRER_LENGTH = 500;

interface PageviewPayload {
  readonly website: string;
  readonly hostname: string;
  readonly url: string;
  readonly userAgent: string;
  readonly referrer?: string;
  readonly language?: string;
  readonly ip?: string;
}

export interface Pageview {
  readonly type: "event";
  readonly payload: PageviewPayload;
}

function ipv4Number(address: string): number {
  return address.split(".").reduce((total, octet) => total * 256 + Number(octet), 0);
}

function inPrivateIpv4Range(address: string): boolean {
  const value = ipv4Number(address);
  return PRIVATE_IPV4_RANGES.some(([base, bits]) => {
    const size = 2 ** (32 - bits);
    const start = ipv4Number(base);
    return value >= start && value < start + size;
  });
}

function ipv4FromNumber(value: number): string {
  return [24, 16, 8, 0].map((shift) => (value >>> shift) & 255).join(".");
}

function ipv6Hextets(address: string): number[] {
  const hexOnly = address.replace(/(\d{1,3}(?:\.\d{1,3}){3})$/, (ipv4) => {
    const value = ipv4Number(ipv4);
    return `${(value >>> 16).toString(16)}:${(value & 0xffff).toString(16)}`;
  });
  const [head = "", tail] = hexOnly.split("::");
  const left = head === "" ? [] : head.split(":");
  const right = tail === undefined || tail === "" ? [] : tail.split(":");
  const zeros = Array.from({ length: 8 - left.length - right.length }, () => "0");
  return [...left, ...zeros, ...right].map((hextet) => Number.parseInt(hextet, 16));
}

function ipv6Value(address: string): bigint {
  return ipv6Hextets(address).reduce((total, hextet) => (total << 16n) | BigInt(hextet), 0n);
}

function inNonPublicIpv6Prefix(value: bigint): boolean {
  return NON_PUBLIC_IPV6_PREFIXES.some(([base, bits]) => {
    const shift = BigInt(128 - bits);
    return value >> shift === ipv6Value(base) >> shift;
  });
}

export function isPublicAddress(address: string): boolean {
  if (isIPv4(address)) return !inPrivateIpv4Range(address);
  if (!isIPv6(address)) return false;
  const value = ipv6Value(address.split("%")[0] ?? address);
  if (value >> 32n === IPV4_MAPPED_PREFIX) {
    return isPublicAddress(ipv4FromNumber(Number(value & 0xffffffffn)));
  }
  return !inNonPublicIpv6Prefix(value);
}

function bareAddress(entry: string): string {
  const value = entry.trim();
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value)?.[1];
  if (bracketed !== undefined) return bracketed;
  return /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value)?.[1] ?? value;
}

export function clientIp(headers: Headers): string | undefined {
  const forwarded = (headers.get("x-forwarded-for") ?? "").split(",").map(bareAddress).reverse();
  const realIp = bareAddress(headers.get("x-real-ip") ?? "");
  return [...forwarded, realIp].find(isPublicAddress);
}

function requestHost(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("host") || new URL(request.url).host;
}

function announcesPrefetch(headers: Headers): boolean {
  return ["sec-purpose", "purpose"].some((name) =>
    (headers.get(name) ?? "").toLowerCase().includes("prefetch"),
  );
}

function isRedirect(response: Response): boolean {
  return response.status !== 200 || response.headers.has("location");
}

function isMarkdown(request: Request, servedPathname: string): boolean {
  return (
    new URL(request.url).pathname.endsWith(MARKDOWN_SUFFIX) || MARKDOWN_ROUTE.test(servedPathname)
  );
}

function isPageRoute(servedPathname: string, routes: ScriptHashesByRoute): boolean {
  return !UNCOUNTED_ROUTES.has(servedPathname) && Object.hasOwn(routes, servedPathname);
}

export function isCountableNavigation(
  request: Request,
  response: Response,
  servedPathname: string,
  routes: ScriptHashesByRoute = loadBuiltScriptHashes(),
): boolean {
  const { headers } = request;
  return (
    request.method === "GET" &&
    headers.get("sec-fetch-dest") === "document" &&
    headers.get("sec-fetch-mode") === "navigate" &&
    !announcesPrefetch(headers) &&
    !isRedirect(response) &&
    !isMarkdown(request, servedPathname) &&
    isPageRoute(servedPathname, routes)
  );
}

function sendsOptOutCookie(headers: Headers): boolean {
  return (headers.get("cookie") ?? "")
    .split(";")
    .some((pair) => pair.trim() === `${ANALYTICS_OPT_OUT_COOKIE}=1`);
}

export function isTrackingRefused(headers: Headers): boolean {
  return headers.get("sec-gpc") === "1" || headers.get("dnt") === "1" || sendsOptOutCookie(headers);
}

function referrerWithoutQuery(headers: Headers): string | undefined {
  const referer = headers.get("referer");
  if (!referer) return undefined;
  try {
    const url = new URL(referer);
    const referrer = `${url.origin}${url.pathname}`;
    return referrer.length > MAX_REFERRER_LENGTH ? undefined : referrer;
  } catch {
    return undefined;
  }
}

function primaryLanguage(headers: Headers): string | undefined {
  const tag = (headers.get("accept-language") ?? "").split(",")[0]?.split(";")[0]?.trim();
  return tag && tag !== "*" && tag.length <= MAX_LANGUAGE_LENGTH ? tag : undefined;
}

export function pageviewFor(request: Request): Pageview | undefined {
  const { headers } = request;
  const userAgent = headers.get("user-agent")?.trim() ?? "";
  if (userAgent === "" || AUTOMATED_AGENT.test(userAgent)) return undefined;
  const referrer = referrerWithoutQuery(headers);
  const language = primaryLanguage(headers);
  const ip = clientIp(headers);
  return {
    type: "event",
    payload: {
      website: UMAMI_WEBSITE_ID,
      hostname: SITE_HOST,
      url: new URL(request.url).pathname,
      userAgent,
      ...(referrer === undefined ? {} : { referrer }),
      ...(language === undefined ? {} : { language }),
      ...(ip === undefined ? {} : { ip }),
    },
  };
}

export function countedPageview(
  request: Request,
  response: Response,
  servedPathname: string,
  routes?: ScriptHashesByRoute,
): Pageview | undefined {
  if (requestHost(request) !== SITE_HOST) return undefined;
  if (isTrackingRefused(request.headers)) return undefined;
  if (!isCountableNavigation(request, response, servedPathname, routes)) return undefined;
  return pageviewFor(request);
}

export async function sendPageview(pageview: Pageview, send: typeof fetch = fetch): Promise<void> {
  try {
    const response = await send(`${UMAMI_ORIGIN}/api/send`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": pageview.payload.userAgent },
      body: JSON.stringify(pageview),
      cache: "no-store",
      signal: AbortSignal.timeout(PAGEVIEW_TIMEOUT_MS),
    });
    await response.body?.cancel();
  } catch {
    return;
  }
}
