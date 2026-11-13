import { COMPARE_PATH, COMPARE_TOOL_PARAM } from "./compare-url";
import { i18n, isLocale, type Locale, localizedPath } from "./i18n";

function pathWithoutLocale(pathname: string): string {
  const [, first = "", ...rest] = pathname.split("/");
  return isLocale(first) ? `/${rest.join("/")}` : pathname;
}

function pathOf(pathname: string): string {
  return pathWithoutLocale(pathname).replace(/(.)\/+$/, "$1");
}

export function carriedSearch(pathname: string, search: string): string {
  if (pathOf(pathname) !== COMPARE_PATH) return "";
  const tool = new URLSearchParams(search).get(COMPARE_TOOL_PARAM);
  return tool === null ? "" : `?${new URLSearchParams({ [COMPARE_TOOL_PARAM]: tool })}`;
}

export function localeSwitchHref(pathname: string, locale: Locale): string {
  const path = pathOf(pathname);
  if (path === "/") return locale === i18n.defaultLanguage ? "/" : `/${locale}`;
  return localizedPath(locale, path);
}
