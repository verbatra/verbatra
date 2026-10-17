"use client";

import { usePathname } from "fumadocs-core/framework";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { releaseUrl } from "@/components/landing/links";
import { landingLocale } from "@/lib/i18n";
import { PACKAGE_VERSION } from "@/lib/site";

export function VersionPill({ newTab }: { newTab: string }): ReactNode {
  const t = useTranslations("landing.nav.version");
  if (!landingLocale(usePathname())) return null;
  const version = `v${PACKAGE_VERSION}`;
  return (
    <a
      href={releaseUrl(PACKAGE_VERSION)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`${t("label", { version })} ${newTab}`}
      className="vk-version-pill"
    >
      {version}
    </a>
  );
}
