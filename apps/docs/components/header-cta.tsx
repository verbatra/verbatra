"use client";

import { usePathname } from "fumadocs-core/framework";
import Link from "fumadocs-core/link";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { buttonClasses } from "@/components/ui/button";
import { i18n, isLocale, type Locale, localizedPath } from "@/lib/i18n";
import { trackUmamiEvent } from "@/lib/umami";

export function landingLocale(pathname: string): Locale | null {
  const segment = pathname.replace(/^\/|\/$/g, "");
  if (segment === "") return i18n.defaultLanguage as Locale;
  return isLocale(segment) ? segment : null;
}

export function HeaderCta(): ReactNode {
  const t = useTranslations("landing.nav.headerCta");
  const locale = landingLocale(usePathname());
  if (!locale) return null;
  return (
    <Link
      href={localizedPath(locale, "/docs/quickstart")}
      className={buttonClasses("primary", "sm", "vk-header-cta me-1 whitespace-nowrap md:me-4")}
      style={{ background: "var(--accent-fill)" }}
      onClick={() => trackUmamiEvent("click-cta", { location: "header", target: "get-started" })}
    >
      {t("label")}
    </Link>
  );
}
