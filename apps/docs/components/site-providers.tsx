import { RootProvider } from "fumadocs-ui/provider/base";
import { NextIntlClientProvider } from "next-intl";
import { getMessages } from "next-intl/server";
import type { ReactNode } from "react";
import { ThemeMeta } from "@/components/theme-meta";
import { pickClientMessages } from "@/lib/client-messages";
import { LocaleAwareFrameworkProvider } from "@/lib/framework-provider";
import type { Locale } from "@/lib/i18n";
import { i18nConfig, SEARCH_OPTIONS } from "@/lib/root-provider-options";
import { THEME_PROVIDER_OPTIONS } from "@/lib/theme";

export async function SiteProviders({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}): Promise<ReactNode> {
  const messages = await getMessages({ locale });
  return (
    <NextIntlClientProvider locale={locale} messages={pickClientMessages(messages)}>
      <LocaleAwareFrameworkProvider>
        <RootProvider
          theme={THEME_PROVIDER_OPTIONS}
          search={SEARCH_OPTIONS}
          i18n={i18nConfig(locale)}
        >
          <ThemeMeta />
          {children}
        </RootProvider>
      </LocaleAwareFrameworkProvider>
    </NextIntlClientProvider>
  );
}
