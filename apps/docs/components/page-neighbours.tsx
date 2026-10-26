import Link from "fumadocs-core/link";
import { findNeighbour } from "fumadocs-core/page-tree";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { withShortCommandLabels } from "@/lib/docs-page-tree";
import type { Locale } from "@/lib/i18n";
import { source } from "@/lib/source";

export async function PageNeighbours({
  locale,
  url,
}: {
  locale: Locale;
  url: string;
}): Promise<ReactNode> {
  const { previous, next } = findNeighbour(withShortCommandLabels(source.getPageTree(locale)), url);
  if (!previous && !next) return null;
  const t = await getTranslations({ locale, namespace: "docs.pagination" });
  return (
    <nav aria-label={t("label")} className="vk-docs-footer">
      {previous ? (
        <Link href={previous.url} rel="prev">
          <span className="vk-docs-footer-direction">{t("previous")}</span>
          <span className="vk-docs-footer-title">{previous.name}</span>
        </Link>
      ) : null}
      {next ? (
        <Link href={next.url} rel="next" data-direction="next">
          <span className="vk-docs-footer-direction">{t("next")}</span>
          <span className="vk-docs-footer-title">{next.name}</span>
        </Link>
      ) : null}
    </nav>
  );
}
