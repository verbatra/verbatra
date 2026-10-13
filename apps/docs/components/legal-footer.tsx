import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { LEGAL_PAGE_LINKS } from "@/components/landing/links";
import { type Locale, localizedPath } from "@/lib/i18n";

const LINK_CLASS =
  "vk-tap inline-flex min-h-6 items-center underline decoration-transparent underline-offset-4 transition-colors hover:text-(--text-strong) hover:decoration-[color:color-mix(in_srgb,var(--accent)_45%,transparent)]";

export async function LegalFooter({ locale }: { locale: Locale }): Promise<ReactNode> {
  const t = await getTranslations({ locale, namespace: "landing.footer.cols.legal" });
  return (
    <footer className="vk-legal-footer border-t border-(--border-default) text-sm text-(--text-muted)">
      <nav aria-label={t("title")} className="vk-legal-footer-nav py-6">
        <ul className="flex flex-wrap items-center gap-x-6 gap-y-2">
          {LEGAL_PAGE_LINKS.map(({ key, path }) => (
            <li key={key}>
              <a href={localizedPath(locale, path)} className={LINK_CLASS}>
                {t(key)}
              </a>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}
