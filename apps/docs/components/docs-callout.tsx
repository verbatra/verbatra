import {
  type Callout,
  CalloutContainer,
  CalloutDescription,
  CalloutTitle,
  type CalloutType,
} from "fumadocs-ui/components/callout";
import { getTranslations } from "next-intl/server";
import type { ComponentProps, ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const CALLOUT_CLASS = "vk-callout";

type CalloutProps = ComponentProps<typeof Callout>;

const LEAD_WORD: Readonly<Partial<Record<CalloutType, "note" | "warning">>> = {
  info: "note",
  warn: "warning",
  warning: "warning",
};

export async function DocsCallout({
  locale,
  type = "info",
  title,
  className,
  children,
  ...rest
}: CalloutProps & { locale: Locale }): Promise<ReactNode> {
  const t = await getTranslations({ locale, namespace: "docs.callout" });
  const word = LEAD_WORD[type];
  const heading = title ?? (word === undefined ? undefined : t(word));
  return (
    <CalloutContainer type={type} className={cn(CALLOUT_CLASS, className)} {...rest}>
      {heading ? <CalloutTitle className="vk-callout-title">{heading}</CalloutTitle> : null}
      <CalloutDescription className="vk-callout-body">{children}</CalloutDescription>
    </CalloutContainer>
  );
}
