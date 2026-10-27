import type { TOCItemType } from "fumadocs-core/toc";
import type { Locale } from "./i18n";
import { UI_TRANSLATIONS } from "./ui-translations";
import { breakAfterUnderscores } from "./word-breaks";

const ON_THIS_PAGE = "On this page(table of contents)";

export function onThisPageLabel(locale: Locale): string {
  return locale === "en" ? "On this page" : UI_TRANSLATIONS[locale][ON_THIS_PAGE];
}

export function pageToc(toc: readonly TOCItemType[], maxDepth?: number): TOCItemType[] {
  return toc
    .filter((item) => maxDepth === undefined || item.depth <= maxDepth)
    .map((item) => ({ ...item, title: breakAfterUnderscores(item.title) }));
}
