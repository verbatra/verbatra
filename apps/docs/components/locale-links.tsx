"use client";

import { usePathname } from "next/navigation";
import { type ReactNode, useId } from "react";
import { i18n, type Locale } from "@/lib/i18n";
import { LOCALE_DISPLAY_NAMES } from "@/lib/language-select-copy";
import { localeSwitchHref } from "@/lib/locale-switch";

export function LocaleLinks({ label, current }: { label: string; current: Locale }): ReactNode {
  const pathname = usePathname();
  const labelId = useId();
  return (
    <nav aria-labelledby={labelId} className="vk-locale-links">
      <p id={labelId} className="vk-locale-links-label">
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
