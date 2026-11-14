import { defineI18n } from "fumadocs-core/i18n";
import { notFound } from "next/navigation";
import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/locales";

export type { Locale };

export const i18n = defineI18n({
  defaultLanguage: DEFAULT_LOCALE,
  languages: [...LOCALES],
  hideLocale: "default-locale",
  fallbackLanguage: DEFAULT_LOCALE,
});

export function isLocale(value: string): value is Locale {
  return (i18n.languages as readonly string[]).includes(value);
}

export function toLocale(value: string): Locale {
  if (!isLocale(value)) notFound();
  return value;
}

export function localizedPath(locale: Locale, path: string): string {
  return locale === i18n.defaultLanguage ? path : `/${locale}${path}`;
}

export type LocalizedAnchors = Readonly<Record<Locale, string>>;

export function localizedAnchorPath(
  locale: Locale,
  page: string,
  anchors: LocalizedAnchors | undefined,
): string {
  const anchor = anchors?.[locale];
  return localizedPath(locale, anchor === undefined ? page : `${page}#${anchor}`);
}

export function localizeHref(locale: Locale, href: string | undefined): string | undefined {
  if (href === undefined || !href.startsWith("/") || href.startsWith("//")) {
    return href;
  }
  if (href === `/${locale}` || href.startsWith(`/${locale}/`)) {
    return href;
  }
  return localizedPath(locale, href);
}

export function landingLocale(pathname: string): Locale | null {
  const segment = pathname.replace(/^\/|\/$/g, "");
  if (segment === "") return i18n.defaultLanguage as Locale;
  return isLocale(segment) ? segment : null;
}
