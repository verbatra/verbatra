import type { MetadataRoute } from "next";
import { i18n, type Locale, localizedPath } from "@/lib/i18n";
import { homePath, SITE_URL } from "@/lib/site";
import { source } from "@/lib/source";

const HOME_PRIORITY: Readonly<Record<Locale, number>> = { en: 1, de: 0.9, es: 0.9, fr: 0.9 };

const LEGAL_PATHS = ["/contact", "/imprint", "/privacy"] as const;

function homeLanguageAlternates(): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const lang of i18n.languages) {
    languages[lang] = new URL(homePath(lang), SITE_URL).href;
  }
  return languages;
}

function legalLanguageAlternates(path: string): Record<string, string> {
  const languages: Record<string, string> = {};
  for (const lang of i18n.languages) {
    languages[lang] = new URL(localizedPath(lang, path), SITE_URL).href;
  }
  return languages;
}

export default function sitemap(): MetadataRoute.Sitemap {
  const buildTime = new Date();
  const homeAlternates = { languages: homeLanguageAlternates() };
  const home: MetadataRoute.Sitemap = i18n.languages.map((locale) => ({
    url: new URL(homePath(locale), SITE_URL).href,
    lastModified: buildTime,
    changeFrequency: "weekly",
    priority: HOME_PRIORITY[locale],
    alternates: homeAlternates,
  }));

  const docs: MetadataRoute.Sitemap = i18n.languages.flatMap((locale) =>
    source.getPages(locale).map((page) => {
      const languages: Record<string, string> = {};
      for (const altLocale of i18n.languages) {
        const altPage = source.getPage(page.slugs, altLocale);
        if (altPage) languages[altLocale] = new URL(altPage.url, SITE_URL).href;
      }
      return {
        url: new URL(page.url, SITE_URL).href,
        lastModified: buildTime,
        changeFrequency: "weekly",
        priority: 0.8,
        alternates: { languages },
      };
    }),
  );

  const legal: MetadataRoute.Sitemap = i18n.languages.flatMap((locale) =>
    LEGAL_PATHS.map((path) => ({
      url: new URL(localizedPath(locale, path), SITE_URL).href,
      lastModified: buildTime,
      changeFrequency: "monthly",
      priority: 0.3,
      alternates: { languages: legalLanguageAlternates(path) },
    })),
  );

  return [...home, ...docs, ...legal];
}
