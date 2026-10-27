import Link from "fumadocs-core/link";
import type { Item } from "fumadocs-core/page-tree";
import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { paginationLabels } from "@/lib/docs-pagination";
import type { Locale } from "@/lib/i18n";

export async function PageNeighbours({
  locale,
  previous,
  next,
}: {
  locale: Locale;
  previous?: Item | undefined;
  next?: Item | undefined;
}): Promise<ReactNode> {
  if (!previous && !next) return null;
  const t = await getTranslations({ locale, namespace: "docs.pagination" });
  const labels = paginationLabels(locale);
  return (
    <nav aria-label={t("label")} className="vk-docs-footer">
      {previous ? (
        <Link href={previous.url} rel="prev">
          <span className="vk-docs-footer-direction vk-label">{labels.previous}</span>
          <span className="vk-docs-footer-title">{previous.name}</span>
        </Link>
      ) : null}
      {next ? (
        <Link href={next.url} rel="next" data-direction="next">
          <span className="vk-docs-footer-direction vk-label">{labels.next}</span>
          <span className="vk-docs-footer-title">{next.name}</span>
        </Link>
      ) : null}
    </nav>
  );
}
