import { DEFAULT_LOCALE, LOCALES } from "@/lib/locales";

export const MAX_RELAY_BODY_BYTES = 1024;

export const MAX_RELAY_PATH_LENGTH = 200;

export function servedPathOf(publicPath: string): string {
  const [, first = ""] = publicPath.split("/");
  const prefixed = first !== DEFAULT_LOCALE && (LOCALES as readonly string[]).includes(first);
  if (prefixed) return publicPath;
  return publicPath === "/" ? `/${DEFAULT_LOCALE}` : `/${DEFAULT_LOCALE}${publicPath}`;
}
