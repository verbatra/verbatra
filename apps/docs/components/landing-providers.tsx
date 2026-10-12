import type { ReactNode } from "react";
import { ClientMessagesProvider } from "@/components/client-messages";
import { loadClientIntl, ThemedRootProvider } from "@/components/themed-root-provider";
import type { Locale } from "@/lib/i18n";

export async function LandingProviders({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}): Promise<ReactNode> {
  return (
    <ClientMessagesProvider value={await loadClientIntl(locale)}>
      <ThemedRootProvider locale={locale}>{children}</ThemedRootProvider>
    </ClientMessagesProvider>
  );
}
