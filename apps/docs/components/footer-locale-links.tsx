import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LocaleLinks } from "@/components/chrome-islands";
import type { Locale } from "@/lib/i18n";

export async function FooterLocaleLinks({ locale }: { locale: Locale }): Promise<ReactNode> {
  const t = await getTranslations({ locale, namespace: "landing.footer" });
  return <LocaleLinks label={t("language")} current={locale} />;
}
