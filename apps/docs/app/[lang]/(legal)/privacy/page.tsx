import { CalloutContainer } from "fumadocs-ui/components/callout";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { AnalyticsOptOut, type AnalyticsOptOutLabels } from "@/components/analytics-opt-out";
import { CALLOUT_CLASS } from "@/components/docs-callout";
import { type Locale, toLocale } from "@/lib/i18n";
import {
  PRIVACY_ANALYTICS_KEY,
  PRIVACY_HEADING_ANCHORS,
  PRIVACY_OBJECTION_HEADING_ID,
  PRIVACY_OBJECTION_KEY,
  PRIVACY_SECTION_KEYS,
  privacyLinkHrefs,
} from "@/lib/legal-privacy";
import { markdownUrl } from "@/lib/markdown-route";
import { LEGAL_LAST_UPDATED, localeAlternates } from "@/lib/site";
import { homeOgImagePath, socialMetadata } from "@/lib/social-metadata";

const linkTagsFor = (locale: Locale) => ({
  ...Object.fromEntries(
    Object.entries(privacyLinkHrefs(locale)).map(([tag, href]) => [
      tag,
      (chunks: ReactNode) => <a href={href}>{chunks}</a>,
    ]),
  ),
  strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
});

export async function generateMetadata(props: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await props.params;
  const locale = toLocale(lang);
  const t = await getTranslations({ locale, namespace: "legal.privacy.meta" });
  const tMeta = await getTranslations({ locale, namespace: "landing.meta" });
  const alternates = localeAlternates(locale, "/privacy");
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

export default async function PrivacyPage(props: { params: Promise<{ lang: string }> }) {
  const { lang } = await props.params;
  const locale = toLocale(lang);
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "legal.privacy" });
  const linkTags = linkTagsFor(locale);
  const optOutLabels: AnalyticsOptOutLabels = {
    optOut: t(`${PRIVACY_ANALYTICS_KEY}.optOut.optOut`),
    optIn: t(`${PRIVACY_ANALYTICS_KEY}.optOut.optIn`),
    statusOptedOut: t(`${PRIVACY_ANALYTICS_KEY}.optOut.statusOptedOut`),
    statusOptedIn: t(`${PRIVACY_ANALYTICS_KEY}.optOut.statusOptedIn`),
    signals: t(`${PRIVACY_ANALYTICS_KEY}.optOut.signals`),
  };

  const lastUpdated = (
    <p>
      <em>
        {t("lastUpdatedLabel")}: {LEGAL_LAST_UPDATED}
      </em>
    </p>
  );

  return (
    <article className="container mx-auto max-w-3xl px-6 py-16 prose">
      <h1>{t("title")}</h1>
      {lastUpdated}

      <p>
        <em>{t("languageVersions")}</em>
      </p>

      {PRIVACY_SECTION_KEYS.map((key) =>
        key === PRIVACY_OBJECTION_KEY ? (
          <section key={key} aria-labelledby={PRIVACY_OBJECTION_HEADING_ID}>
            <CalloutContainer type="info" className={CALLOUT_CLASS}>
              <h2 id={PRIVACY_OBJECTION_HEADING_ID} className="mt-0 scroll-mt-24">
                {t(`${key}.heading`)}
              </h2>
              <p className="mb-0">{t.rich(`${key}.body`, linkTags)}</p>
            </CalloutContainer>
          </section>
        ) : (
          <section key={key}>
            <h2 id={PRIVACY_HEADING_ANCHORS[key]} className="scroll-mt-24">
              {t(`${key}.heading`)}
            </h2>
            <p>{t.rich(`${key}.body`, linkTags)}</p>
            {key === PRIVACY_ANALYTICS_KEY && (
              <AnalyticsOptOut locale={locale} labels={optOutLabels} />
            )}
          </section>
        ),
      )}

      {lastUpdated}
    </article>
  );
}
