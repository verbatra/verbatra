import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Fragment, type ReactNode } from "react";
import { type Locale, localizedPath, toLocale } from "@/lib/i18n";
import {
  IMPRINT_EMAIL,
  IMPRINT_EMAIL_LABEL,
  IMPRINT_LICENSE_HEADING,
  IMPRINT_PROVIDER_HEADING,
  IMPRINT_PROVIDER_LINES,
  IMPRINT_TITLE,
  imprintLicenseRuns,
} from "@/lib/legal-imprint";
import { markdownUrl } from "@/lib/markdown-route";
import { LEGAL_LAST_UPDATED, localeAlternates } from "@/lib/site";
import { homeOgImagePath, socialMetadata } from "@/lib/social-metadata";

const linkTagsFor = (locale: Locale) => ({
  link: (chunks: ReactNode) => <a href={localizedPath(locale, "/contact")}>{chunks}</a>,
});

export async function generateMetadata(props: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await props.params;
  const locale = toLocale(lang);
  const t = await getTranslations({ locale, namespace: "legal.imprint.meta" });
  const tMeta = await getTranslations({ locale, namespace: "landing.meta" });
  const alternates = localeAlternates(locale, "/imprint");
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: true },
    alternates: { ...alternates, types: { "text/markdown": markdownUrl(alternates.canonical) } },
    ...socialMetadata({
      locale,
      path: alternates.canonical,
      type: "website",
      title: t("title"),
      description: t("description"),
      image: { path: homeOgImagePath(locale), alt: tMeta("ogImageAlt") },
    }),
  };
}

export default async function ImprintPage(props: { params: Promise<{ lang: string }> }) {
  const { lang } = await props.params;
  const locale = toLocale(lang);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "legal.imprint" });
  const linkTags = linkTagsFor(locale);

  return (
    <article className="container mx-auto max-w-3xl px-6 py-16 prose">
      <h1>{IMPRINT_TITLE}</h1>
      <p>{t("intro")}</p>
      <p>
        <em>
          {t("lastUpdatedLabel")}: {LEGAL_LAST_UPDATED}
        </em>
      </p>

      <h2>{IMPRINT_PROVIDER_HEADING}</h2>
      <p>
        {IMPRINT_PROVIDER_LINES.map((line) => (
          <Fragment key={line}>
            {line}
            <br />
          </Fragment>
        ))}
        {IMPRINT_EMAIL_LABEL}: <a href={`mailto:${IMPRINT_EMAIL}`}>{IMPRINT_EMAIL}</a>
      </p>
      <p>{t.rich("contactLinkNote", linkTags)}</p>

      <h2>{IMPRINT_LICENSE_HEADING}</h2>
      <p>
        {imprintLicenseRuns(locale).map((run) =>
          typeof run === "string" ? (
            run
          ) : (
            <a
              key={run.href}
              href={run.href}
              {...(run.external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
            >
              {run.text}
            </a>
          ),
        )}
      </p>
    </article>
  );
}
