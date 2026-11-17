import { pageviewUrl } from "@/lib/pageview-url";

export type TrackerPayload = Readonly<Record<string, unknown>>;

function parsed(value: string, base: string): URL | undefined {
  try {
    return new URL(value, base);
  } catch {
    return undefined;
  }
}

function cleanUrl(value: string, base: string): string {
  const url = parsed(value, base);
  return url === undefined ? "/" : pageviewUrl(url.href);
}

function cleanReferrer(value: string, base: string): string {
  if (value === "") return "";
  const url = /^[a-z][a-z0-9+.-]*:/i.test(value) ? parsed(value, base) : undefined;
  return url === undefined ? "" : `${url.origin}${url.pathname}`;
}

export function sanitizeTrackerPayload(
  _type: string,
  payload: TrackerPayload,
  base: string = window.location.origin,
): TrackerPayload {
  const { screen: _screen, ...rest } = payload;
  return {
    ...rest,
    ...(typeof rest.url === "string" ? { url: cleanUrl(rest.url, base) } : {}),
    ...(typeof rest.referrer === "string" ? { referrer: cleanReferrer(rest.referrer, base) } : {}),
  };
}
