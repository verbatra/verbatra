"use client";

import type { AbstractIntlMessages } from "next-intl";
import { createContext, type ReactNode, use } from "react";

export type ClientMessages = {
  readonly locale: string;
  readonly timeZone: string;
  readonly messages: AbstractIntlMessages;
};

const ClientMessagesContext = createContext<ClientMessages | null>(null);

export function ClientMessagesProvider({
  value,
  children,
}: {
  value: ClientMessages;
  children: ReactNode;
}): ReactNode {
  return <ClientMessagesContext value={value}>{children}</ClientMessagesContext>;
}

export function useClientMessages(): ClientMessages | null {
  return use(ClientMessagesContext);
}
