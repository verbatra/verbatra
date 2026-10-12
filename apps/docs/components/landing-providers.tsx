import { RootProvider } from "fumadocs-ui/provider/base";
import { getMessages, getTimeZone } from "next-intl/server";
import type { ReactNode } from "react";
import { ClientMessagesProvider } from "@/components/client-messages";
import { ThemeMeta } from "@/components/theme-meta";
import { pickClientMessages } from "@/lib/client-messages";
import { LocaleAwareFrameworkProvider } from "@/lib/framework-provider";
import type { Locale } from "@/lib/i18n";
import { i18nConfig, SEARCH_OPTIONS } from "@/lib/root-provider-options";
import { THEME_PROVIDER_OPTIONS } from "@/lib/theme";

export async function LandingProviders({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}): Promise<ReactNode> {
  const [messages, timeZone] = await Promise.all([
    getMessages({ locale }),
    getTimeZone({ locale }),
  ]);
  return (
    <ClientMessagesProvider value={{ locale, timeZone, messages: pickClientMessages(messages) }}>
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
    </ClientMessagesProvider>
  );
}
