import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LICENSE_URL } from "@/components/landing/links";
import { type Locale, localizedPath, toLocale } from "@/lib/i18n";
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
    alternates,
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
  const t = await getTranslations({ locale, namespace: "legal.imprint" });
  const linkTags = linkTagsFor(locale);

  return (
    <article className="container mx-auto max-w-3xl px-6 py-16 prose">
      <h1>Impressum</h1>
      <p>{t("intro")}</p>
      <p>
        <em>
          {t("lastUpdatedLabel")}: {LEGAL_LAST_UPDATED}
        </em>
      </p>

      <h2>Angaben gem&auml;&szlig; &sect; 18 Abs. 1 MStV</h2>
      <p>
        Mario Kreitz
        <br />
        M&ouml;nchfeldstra&szlig;e 7
        <br />
        70378 Stuttgart
        <br />
        Deutschland
        <br />
        E-Mail: <a href="mailto:info@kreitz-webdev.de">info@kreitz-webdev.de</a>
      </p>
      <p>{t.rich("contactLinkNote", linkTags)}</p>

      <h2>Hinweis</h2>
      <p>
        Diese Website ist die Dokumentation des nicht-kommerziellen Open-Source-Projekts verbatra.
        Es werden keine Waren oder Dienstleistungen gegen Entgelt angeboten, und es wird keine
        Werbung geschaltet.
      </p>

      <h2>Lizenz</h2>
      <p>
        Der Quellcode von verbatra steht unter der{" "}
        <a href={LICENSE_URL} target="_blank" rel="noreferrer noopener">
          MIT-Lizenz
        </a>
        .
      </p>
    </article>
  );
}
