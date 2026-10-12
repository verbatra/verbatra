import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import { loadClientIntl, ThemedRootProvider } from "@/components/themed-root-provider";
import type { Locale } from "@/lib/i18n";

export async function SiteProviders({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}): Promise<ReactNode> {
  const { messages, timeZone } = await loadClientIntl(locale);
  return (
    <NextIntlClientProvider locale={locale} timeZone={timeZone} messages={messages}>
      <ThemedRootProvider locale={locale}>{children}</ThemedRootProvider>
    </NextIntlClientProvider>
  );
}
