"use client";

import { usePathname } from "fumadocs-core/framework";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { landingLocale } from "@/components/header-cta";
import { releaseUrl } from "@/components/landing/links";
import { PACKAGE_VERSION } from "@/lib/site";

export function VersionPill(): ReactNode {
  const t = useTranslations("landing.nav.version");
  if (!landingLocale(usePathname())) return null;
  const version = `v${PACKAGE_VERSION}`;
  return (
    <a
      href={releaseUrl(PACKAGE_VERSION)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("label", { version })}
      className="vk-version-pill"
      data-umami-event="outbound-link"
      data-umami-event-target="version"
      data-umami-event-location="header"
    >
      {version}
    </a>
  );
}
