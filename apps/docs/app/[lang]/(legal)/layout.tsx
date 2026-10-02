import type { ReactNode } from "react";
import { LegalFooter } from "@/components/legal-footer";
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
  return (
    <LocaleHomeLayout params={params} footer={<LegalFooter locale={toLocale(lang)} />}>
      {children}
    </LocaleHomeLayout>
  );
}
