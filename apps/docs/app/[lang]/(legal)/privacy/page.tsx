import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { i18n, toLocale } from "@/lib/i18n";
import { LEGAL_LAST_UPDATED, localeAlternates } from "@/lib/site";

const UMAMI_DOCS = "https://umami.is/docs/";
const GITHUB_REPO = "https://github.com/verbatra/verbatra";
const GITHUB_PRIVACY =
  "https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement";
const NPM_SCOPE = "https://www.npmjs.com/search?q=%40verbatra";
const NPM_PRIVACY = "https://docs.npmjs.com/policies/privacy";
const CONTABO_URL = "https://contabo.com/de/";
const CONTACT_MAILTO = "mailto:info@kreitz-webdev.de";

const SECTION_KEYS = [
  "s1",
  "s2",
  "s3",
  "s4",
  "s5",
  "s6",
  "s7",
  "s8",
  "s9",
  "s10",
  "s11",
  "s12",
] as const;

const linkTags = {
  email: (chunks: ReactNode) => <a href={CONTACT_MAILTO}>{chunks}</a>,
  umami: (chunks: ReactNode) => <a href={UMAMI_DOCS}>{chunks}</a>,
  repo: (chunks: ReactNode) => <a href={GITHUB_REPO}>{chunks}</a>,
  ghprivacy: (chunks: ReactNode) => <a href={GITHUB_PRIVACY}>{chunks}</a>,
  npm: (chunks: ReactNode) => <a href={NPM_SCOPE}>{chunks}</a>,
  npmprivacy: (chunks: ReactNode) => <a href={NPM_PRIVACY}>{chunks}</a>,
  contabo: (chunks: ReactNode) => <a href={CONTABO_URL}>{chunks}</a>,
  contact: (chunks: ReactNode) => <a href="/contact">{chunks}</a>,
  strong: (chunks: ReactNode) => <strong>{chunks}</strong>,
};

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

  const lastUpdated = (
    <p>
      <em>
        {t("lastUpdatedLabel")}: {LEGAL_LAST_UPDATED}
      </em>
    </p>
  );

  return (
    <main className="container mx-auto max-w-3xl px-6 py-16 prose">
      <h1>{t("title")}</h1>
      {lastUpdated}

      {!isAuthoritative && (
        <p>
          <em>{t("disclaimer")}</em>
        </p>
      )}

      {SECTION_KEYS.map((key) => (
        <section key={key}>
          <h2>{t(`${key}.heading`)}</h2>
          <p>{t.rich(`${key}.body`, linkTags)}</p>
        </section>
      ))}

      {lastUpdated}
    </main>
  );
}
