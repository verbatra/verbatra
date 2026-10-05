import { defineI18n } from "fumadocs-core/i18n";
import { notFound } from "next/navigation";

export const i18n = defineI18n({
  defaultLanguage: "en",
  languages: ["en", "de", "es", "fr"],
  hideLocale: "default-locale",
  fallbackLanguage: "en",
});

export type Locale = (typeof i18n.languages)[number];

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
