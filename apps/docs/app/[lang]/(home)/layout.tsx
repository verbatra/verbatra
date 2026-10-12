import { setRequestLocale } from "next-intl/server";
import type { ReactNode } from "react";
import { FullFooter } from "@/components/landing/footer";
import { LandingProviders } from "@/components/landing-providers";
import { toLocale } from "@/lib/i18n";
import { LocaleHomeLayout } from "@/lib/locale-home-layout";

export default async function HomeRouteLayout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}): Promise<ReactNode> {
  const { lang } = await params;
  const locale = toLocale(lang);
  setRequestLocale(locale);
  return (
    <LandingProviders locale={locale}>
      <LocaleHomeLayout params={params} footer={<FullFooter />}>
        {children}
      </LocaleHomeLayout>
    </LandingProviders>
  );
}
