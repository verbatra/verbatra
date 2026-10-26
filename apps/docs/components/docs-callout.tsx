import { Callout } from "fumadocs-ui/components/callout";
import { getTranslations } from "next-intl/server";
import type { ComponentProps, ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const CALLOUT_CLASS = "vk-callout";

const LEAD_WORD: Readonly<Record<string, "note" | "warning">> = {
  info: "note",
  warn: "warning",
  warning: "warning",
};

export async function DocsCallout({
  locale,
  type = "info",
  title,
  className,
  ...rest
}: ComponentProps<typeof Callout> & { locale: Locale }): Promise<ReactNode> {
  const t = await getTranslations({ locale, namespace: "docs.callout" });
  const word = LEAD_WORD[type];
  return (
    <Callout
      type={type}
      title={title ?? (word === undefined ? undefined : t(word))}
      className={cn(CALLOUT_CLASS, className)}
      {...rest}
    />
  );
}
