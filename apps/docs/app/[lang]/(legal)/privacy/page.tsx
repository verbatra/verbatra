import { CalloutContainer } from "fumadocs-ui/components/callout";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { AnalyticsOptOut, type AnalyticsOptOutLabels } from "@/components/analytics-opt-out";
import { CALLOUT_CLASS } from "@/components/mdx";
import { i18n, type Locale, localizedPath, toLocale } from "@/lib/i18n";
import { LEGAL_LAST_UPDATED, localeAlternates, PRIVACY_CONTACT_FORM_ANCHOR } from "@/lib/site";

const UMAMI_DOCS = "https://umami.is/docs/";
const GITHUB_REPO = "https://github.com/verbatra/verbatra";
const GITHUB_PRIVACY =
  "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement";
const NPM_SCOPE = "https://www.npmjs.com/search?q=%40verbatra";
const NPM_PRIVACY = "https://docs.npmjs.com/policies/privacy";
const CONTABO_URL = "https://contabo.com/de/";
const ARCJET_PRIVACY = "https://docs.arcjet.com/privacy";
const CONTACT_MAILTO = "mailto:info@kreitz-webdev.de";
const SUPERVISORY_AUTHORITY_URL = "https://www.baden-wuerttemberg.datenschutz.de";

const OBJECTION_KEY = "objection";
const ANALYTICS_KEY = "s4";
const OBJECTION_HEADING_ID = "right-to-object";

const SECTION_KEYS = [
  "s1",
  "s2",
  "s3",
  ANALYTICS_KEY,
  "s5",
  "s6",
  "s7",
  "s8",
  OBJECTION_KEY,
  "s9",
  "s10",
  "s11",
  "s12",
] as const;

const HEADING_ANCHORS: Partial<Record<(typeof SECTION_KEYS)[number], string>> = {
  s11: PRIVACY_CONTACT_FORM_ANCHOR,
};

const linkTagsFor = (locale: Locale) => ({
  email: (chunks: ReactNode) => <a href={CONTACT_MAILTO}>{chunks}</a>,
  umami: (chunks: ReactNode) => <a href={UMAMI_DOCS}>{chunks}</a>,
  repo: (chunks: ReactNode) => <a href={GITHUB_REPO}>{chunks}</a>,
  ghprivacy: (chunks: ReactNode) => <a href={GITHUB_PRIVACY}>{chunks}</a>,
  npm: (chunks: ReactNode) => <a href={NPM_SCOPE}>{chunks}</a>,
  npmprivacy: (chunks: ReactNode) => <a href={NPM_PRIVACY}>{chunks}</a>,
  contabo: (chunks: ReactNode) => <a href={CONTABO_URL}>{chunks}</a>,
  arcjetprivacy: (chunks: ReactNode) => <a href={ARCJET_PRIVACY}>{chunks}</a>,
  contact: (chunks: ReactNode) => <a href={localizedPath(locale, "/contact")}>{chunks}</a>,
  imprint: (chunks: ReactNode) => <a href={localizedPath(locale, "/imprint")}>{chunks}</a>,
  lfdi: (chunks: ReactNode) => <a href={SUPERVISORY_AUTHORITY_URL}>{chunks}</a>,
  strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
});

export async function generateMetadata(props: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await props.params;
  const locale = toLocale(lang);
  const t = await getTranslations({ locale, namespace: "legal.privacy.meta" });
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: true },
    alternates: localeAlternates(locale, "/privacy"),
  };
}

export default async function PrivacyPage(props: { params: Promise<{ lang: string }> }) {
  const { lang } = await props.params;
  const locale = toLocale(lang);
  const t = await getTranslations({ locale, namespace: "legal.privacy" });
  const isAuthoritative = locale === i18n.defaultLanguage;
  const linkTags = linkTagsFor(locale);
  const optOutLabels: AnalyticsOptOutLabels = {
    optOut: t(`${ANALYTICS_KEY}.optOut.optOut`),
    optIn: t(`${ANALYTICS_KEY}.optOut.optIn`),
    statusPending: t(`${ANALYTICS_KEY}.optOut.statusPending`),
    statusCounted: t(`${ANALYTICS_KEY}.optOut.statusCounted`),
    statusOptedOut: t(`${ANALYTICS_KEY}.optOut.statusOptedOut`),
    statusDoNotTrack: t(`${ANALYTICS_KEY}.optOut.statusDoNotTrack`),
    statusUnavailable: t(`${ANALYTICS_KEY}.optOut.statusUnavailable`),
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

      {!isAuthoritative && (
        <p>
          <em>{t("disclaimer")}</em>
        </p>
      )}

      {SECTION_KEYS.map((key) =>
        key === OBJECTION_KEY ? (
          <section key={key} aria-labelledby={OBJECTION_HEADING_ID}>
            <CalloutContainer type="info" className={CALLOUT_CLASS}>
              <h2 id={OBJECTION_HEADING_ID} className="mt-0 scroll-mt-24">
                {t(`${key}.heading`)}
              </h2>
              <p className="mb-0">{t.rich(`${key}.body`, linkTags)}</p>
            </CalloutContainer>
          </section>
        ) : (
          <section key={key}>
            <h2 id={HEADING_ANCHORS[key]} className="scroll-mt-24">
              {t(`${key}.heading`)}
            </h2>
            <p>{t.rich(`${key}.body`, linkTags)}</p>
            {key === ANALYTICS_KEY && <AnalyticsOptOut labels={optOutLabels} />}
          </section>
        ),
      )}

      {lastUpdated}
    </article>
  );
}
