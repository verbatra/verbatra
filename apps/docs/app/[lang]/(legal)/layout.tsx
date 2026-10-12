import type { ReactNode } from "react";
import { LegalFooter } from "@/components/legal-footer";
import { SiteProviders } from "@/components/site-providers";
import { toLocale } from "@/lib/i18n";
import { LocaleHomeLayout } from "@/lib/locale-home-layout";

export default async function LegalRouteLayout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}): Promise<ReactNode> {
  const { lang } = await params;
  const locale = toLocale(lang);
  return (
    <SiteProviders locale={locale}>
      <LocaleHomeLayout params={params} footer={<LegalFooter locale={locale} />}>
        {children}
      </LocaleHomeLayout>
    </SiteProviders>
  );
}
