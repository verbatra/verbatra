import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LEGAL_PAGE_LINKS } from "@/components/landing/links";
import { LocaleLinks } from "@/components/locale-links";
import { type Locale, localizedPath } from "@/lib/i18n";

const LINK_CLASS =
  "vk-tap inline-flex min-h-6 items-center underline decoration-transparent underline-offset-4 transition-colors hover:text-(--text-strong) hover:decoration-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]";

export async function LegalFooter({
  locale,
  localeLinks = true,
}: {
  locale: Locale;
  localeLinks?: boolean;
}): Promise<ReactNode> {
  const t = await getTranslations({ locale, namespace: "landing.footer" });
  return (
    <footer className="vk-legal-footer border-t border-(--border-default) text-sm text-(--text-muted)">
      <div className="vk-legal-footer-nav flex flex-wrap items-center justify-between gap-x-8 gap-y-3 py-6">
        <nav aria-label={t("cols.legal.title")}>
          <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
            {LEGAL_PAGE_LINKS.map(({ key, path }) => (
              <li key={key}>
                <a href={localizedPath(locale, path)} className={LINK_CLASS}>
                  {t(`cols.legal.${key}`)}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        {localeLinks ? <LocaleLinks label={t("language")} current={locale} /> : null}
      </div>
    </footer>
  );
}
