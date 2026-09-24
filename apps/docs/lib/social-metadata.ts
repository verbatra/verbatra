import type { Metadata } from "next";
import type { Locale } from "./i18n";
import { localizedPath } from "./i18n";
import { ogAlternateLocales, ogLocale, SITE_URL } from "./site";

const TWITTER_HANDLE = "@mariokreitz";

function descriptionOf(description: string | undefined): { description?: string } {
  return description === undefined ? {} : { description };
}

export function homeOgImagePath(locale: Locale): string {
  return localizedPath(locale, "/home-og");
}

export function socialMetadata(args: {
  locale: Locale;
  path: string;
  type: "website" | "article";
  title: string;
  description?: string | undefined;
  image: { path: string; alt: string };
  twitterTitle?: string | undefined;
  twitterDescription?: string | undefined;
}): Pick<Metadata, "openGraph" | "twitter"> {
  return {
    openGraph: {
      type: args.type,
      siteName: "verbatra",
      locale: ogLocale(args.locale),
      alternateLocale: ogAlternateLocales(args.locale),
      url: new URL(args.path, SITE_URL).href,
      title: args.title,
      ...descriptionOf(args.description),
      images: [{ url: args.image.path, width: 1200, height: 630, alt: args.image.alt }],
    },
    twitter: {
      card: "summary_large_image",
      site: TWITTER_HANDLE,
      creator: TWITTER_HANDLE,
      title: args.twitterTitle ?? args.title,
      ...descriptionOf(args.twitterDescription ?? args.description),
      images: [args.image.path],
    },
  };
}
