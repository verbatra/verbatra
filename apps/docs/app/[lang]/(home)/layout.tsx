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
  return (
    <LandingProviders locale={toLocale(lang)}>
      <LocaleHomeLayout params={params} footer={<FullFooter />}>
        {children}
      </LocaleHomeLayout>
    </LandingProviders>
  );
}
