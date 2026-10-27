import { i18n, isLocale, type Locale, localizedPath } from "./i18n";

function pathWithoutLocale(pathname: string): string {
  const [, first = "", ...rest] = pathname.split("/");
  return isLocale(first) ? `/${rest.join("/")}` : pathname;
}

export function localeSwitchHref(pathname: string, locale: Locale): string {
  const path = pathWithoutLocale(pathname).replace(/(.)\/+$/, "$1");
  if (path === "/") return locale === i18n.defaultLanguage ? "/" : `/${locale}`;
  return localizedPath(locale, path);
}
