import { RootProvider } from "fumadocs-ui/provider/base";
import { getMessages, getTimeZone } from "next-intl/server";
import type { ReactNode } from "react";
import type { ClientMessages } from "@/components/client-messages";
import { pickClientMessages } from "@/lib/client-messages";
import { LocaleAwareFrameworkProvider } from "@/lib/framework-provider";
import type { Locale } from "@/lib/i18n";
import { i18nConfig, SEARCH_OPTIONS } from "@/lib/root-provider-options";

const THEME_OPTIONS = { enabled: false } as const;

export async function loadClientIntl(locale: Locale): Promise<ClientMessages> {
  const [messages, timeZone] = await Promise.all([
    getMessages({ locale }),
    getTimeZone({ locale }),
  ]);
  return { locale, timeZone, messages: pickClientMessages(messages) };
}

export function ThemedRootProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}): ReactNode {
  return (
    <LocaleAwareFrameworkProvider>
      <RootProvider theme={THEME_OPTIONS} search={SEARCH_OPTIONS} i18n={i18nConfig(locale)}>
        {children}
      </RootProvider>
    </LocaleAwareFrameworkProvider>
  );
}
