import { ANALYTICS_CHOICE_COOKIE, LEGACY_OPT_OUT_COOKIE } from "@/lib/umami-config.mjs";

function cookieValue(header: string | null | undefined, name: string): string | undefined {
  for (const pair of (header ?? "").split(";")) {
    const separator = pair.indexOf("=");
    if (separator >= 0 && pair.slice(0, separator).trim() === name) {
      return pair.slice(separator + 1).trim();
    }
  }
  return undefined;
}

export function hasObjectionCookie(header: string | null | undefined): boolean {
  return (
    cookieValue(header, ANALYTICS_CHOICE_COOKIE) === "off" ||
    cookieValue(header, LEGACY_OPT_OUT_COOKIE) === "1"
  );
}
