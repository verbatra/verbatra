import type { ReactNode } from "react";
import { FullFooter } from "@/components/landing/footer";
import { LocaleHomeLayout } from "@/lib/locale-home-layout";

export default function HomeRouteLayout({
  params,
  children,
}: {
  params: Promise<{ lang: string }>;
  children: ReactNode;
}): ReactNode {
  return (
    <LocaleHomeLayout params={params} footer={<FullFooter />}>
      {children}
    </LocaleHomeLayout>
  );
}
