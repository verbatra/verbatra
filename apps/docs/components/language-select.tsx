"use client";

import { buttonVariants } from "fumadocs-ui/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "fumadocs-ui/components/ui/popover";
import { useI18n } from "fumadocs-ui/contexts/i18n";
import type { LanguageSelectProps } from "fumadocs-ui/layouts/shared/slots/language-select";
import { useTranslations } from "next-intl";
import { type ReactNode, useId } from "react";
import { i18n, isLocale } from "@/lib/i18n";
import { LOCALE_DISPLAY_NAMES } from "@/lib/language-select-copy";
import { cn } from "@/lib/utils";

function SparkleIcon({ className }: { className?: string }): ReactNode {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      style={{ color: "var(--accent)" }}
    >
      <path d="M11 2.5a1 1 0 0 1 1.94 0l1.06 4.24a4 4 0 0 0 2.9 2.9l4.24 1.06a1 1 0 0 1 0 1.94l-4.24 1.06a4 4 0 0 0-2.9 2.9l-1.06 4.24a1 1 0 0 1-1.94 0l-1.06-4.24a4 4 0 0 0-2.9-2.9L2.8 12.7a1 1 0 0 1 0-1.94l4.24-1.06a4 4 0 0 0 2.9-2.9z" />
    </svg>
  );
}

function LocaleOptionLabel({
  isMachineTranslated,
  name,
}: {
  isMachineTranslated: boolean;
  name: string;
}): ReactNode {
  if (!isMachineTranslated) return <>{name}</>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {name}
      <SparkleIcon className="shrink-0" />
    </span>
  );
}

export function LocaleAwareLanguageSelect({
  className,
  variant = "ghost",
  children,
  ...rest
}: LanguageSelectProps): ReactNode {
  const context = useI18n();
  const t = useTranslations("landing.nav.languageSwitcher");
  const baseId = useId();
  const descriptionId = `${baseId}-machine-translated`;
  const headingId = `${baseId}-heading`;
  if (!context.locales) throw new Error("Missing `<I18nProvider />`");

  const currentLocale =
    context.locale !== undefined && isLocale(context.locale)
      ? context.locale
      : i18n.defaultLanguage;
  const ariaLabel = `${LOCALE_DISPLAY_NAMES[currentLocale]} - ${t("triggerAriaSuffix")}`;
  const machineTranslatedDescription = t("machineTranslatedDescription");

  return (
    <Popover>
      <PopoverTrigger
        aria-label={ariaLabel}
        className={cn(
          buttonVariants({ variant }),
          "vk-tap gap-1.5 p-1.5 data-[state=open]:bg-(--surface-hover)",
          className,
        )}
        {...rest}
      >
        {children}
      </PopoverTrigger>
      <PopoverContent aria-labelledby={headingId} className="flex flex-col gap-0.5 p-1">
        <p id={headingId} className="p-2 text-xs font-medium text-(--text-muted)">
          {t("chooseLanguage")}
        </p>
        {context.locales.map((item) => {
          const isMachineTranslated = item.locale !== i18n.defaultLanguage;
          return (
            <button
              key={item.locale}
              type="button"
              title={isMachineTranslated ? t("machineTranslatedLabel") : undefined}
              aria-describedby={isMachineTranslated ? descriptionId : undefined}
              aria-current={item.locale === currentLocale ? "true" : undefined}
              className={cn(
                "vk-tap px-2 py-1.5 text-start text-sm rounded-lg transition-colors",
                item.locale === currentLocale
                  ? "bg-(--accent)/10 text-(--accent)"
                  : "text-(--text-muted) hover:bg-(--surface-hover) hover:text-(--text-strong)",
              )}
              onClick={() => context.onChange?.(item.locale)}
            >
              <LocaleOptionLabel isMachineTranslated={isMachineTranslated} name={item.name} />
            </button>
          );
        })}
        <span id={descriptionId} className="sr-only">
          {machineTranslatedDescription}
        </span>
      </PopoverContent>
    </Popover>
  );
}
