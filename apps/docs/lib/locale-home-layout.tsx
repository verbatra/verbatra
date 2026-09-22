import { HomeLayout } from "fumadocs-ui/layouts/home";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { HomeSiteHeader } from "@/components/site-header";
import { toLocale } from "@/lib/i18n";
import { baseOptions } from "@/lib/layout.shared";

export const MAIN_CONTENT_ID = "main-content";

export async function LocaleHomeLayout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}) {
  const { lang } = await params;
  const locale = toLocale(lang);
  const t = await getTranslations({ locale, namespace: "landing.nav" });
  const options = await baseOptions(locale);
  return (
    <>
      <a className="vk-skip-link" href={`#${MAIN_CONTENT_ID}`}>
        {t("skipToContent")}
      </a>
      <HomeLayout
        {...options}
        slots={{ ...options.slots, header: HomeSiteHeader }}
        className="[--fd-layout-width:var(--width-layout)]"
      >
        <div id={MAIN_CONTENT_ID} tabIndex={-1} className="flex flex-1 flex-col">
          {children}
        </div>
      </HomeLayout>
    </>
  );
}
