"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { i18n, type Locale } from "@/lib/i18n";
import { LOCALE_DISPLAY_NAMES } from "@/lib/language-select-copy";
import { localeSwitchHref } from "@/lib/locale-switch";

const LABEL_ID = "footer-locale-label";

export function LocaleLinks({ label, current }: { label: string; current: Locale }): ReactNode {
  const pathname = usePathname();
  return (
    <nav aria-labelledby={LABEL_ID} className="vk-locale-links">
      <p id={LABEL_ID} className="vk-locale-links-label">
        {label}
      </p>
      <ul>
        {i18n.languages.map((locale) => (
          <li key={locale}>
            <a
              href={localeSwitchHref(pathname, locale)}
              hrefLang={locale}
              lang={locale}
              aria-current={locale === current ? "page" : undefined}
              className="vk-tap vk-locale-link"
            >
              {LOCALE_DISPLAY_NAMES[locale]}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
