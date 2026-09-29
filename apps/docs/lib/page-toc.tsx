import type { TOCItemType } from "fumadocs-core/toc";
import { Fragment, type ReactNode } from "react";
import type { Locale } from "./i18n";
import { UI_TRANSLATIONS } from "./ui-translations";

const ON_THIS_PAGE = "On this page(table of contents)";

export function onThisPageLabel(locale: Locale): string {
  return locale === "en" ? "On this page" : UI_TRANSLATIONS[locale][ON_THIS_PAGE];
}

export function breakAfterUnderscores(title: ReactNode): ReactNode {
  if (typeof title !== "string" || !title.includes("_")) return title;
  return title.split(/(?<=_)/).map((part, index) => (
    <Fragment key={`${index}-${part}`}>
      {index > 0 ? <wbr /> : null}
      {part}
    </Fragment>
  ));
}

export function pageToc(toc: readonly TOCItemType[], maxDepth?: number): TOCItemType[] {
  return toc
    .filter((item) => maxDepth === undefined || item.depth <= maxDepth)
    .map((item) => ({ ...item, title: breakAfterUnderscores(item.title) }));
}
