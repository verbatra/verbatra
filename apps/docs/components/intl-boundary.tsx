"use client";

import { NextIntlClientProvider } from "next-intl";
import type { ComponentType, ReactNode } from "react";
import { useClientMessages } from "@/components/client-messages";

export function IntlBoundary({ children }: { children: ReactNode }): ReactNode {
  const client = useClientMessages();
  if (!client) return children;
  return (
    <NextIntlClientProvider
      locale={client.locale}
      timeZone={client.timeZone}
      messages={client.messages}
    >
      {children}
    </NextIntlClientProvider>
  );
}

export function withIntl<P extends object>(Component: ComponentType<P>): ComponentType<P> {
  return function WithIntl(props: P): ReactNode {
    return (
      <IntlBoundary>
        <Component {...props} />
      </IntlBoundary>
    );
  };
}
