import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { ContactForm } from "@/components/contact-form";
import { localizedPath, toLocale } from "@/lib/i18n";
import { localeAlternates, PRIVACY_CONTACT_FORM_ANCHOR } from "@/lib/site";

export async function generateMetadata(props: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await props.params;
  const locale = toLocale(lang);
  const t = await getTranslations({ locale, namespace: "legal.contact.meta" });
  return {
    title: t("title"),
    description: t("description"),
    robots: { index: true },
    alternates: localeAlternates(locale, "/contact"),
  };
}

export default async function ContactPage(props: { params: Promise<{ lang: string }> }) {
  const { lang } = await props.params;
  const locale = toLocale(lang);
  const t = await getTranslations({ locale, namespace: "legal.contact" });
  const privacyHref = `${localizedPath(locale, "/privacy")}#${PRIVACY_CONTACT_FORM_ANCHOR}`;
  const privacyNotice = t.rich("privacyNotice", {
    privacy: (chunks: ReactNode) => (
      <a href={privacyHref} className="vk-prose-link">
        {chunks}
      </a>
    ),
  });

  return (
    <article className="container mx-auto max-w-3xl px-6 py-16 prose">
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>
      <ContactForm privacyNotice={privacyNotice} />
    </article>
  );
}
