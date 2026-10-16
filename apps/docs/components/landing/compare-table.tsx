import type { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import {
  COMPARE_TOOL_NAMES,
  type CompareFootnote,
  compareSource,
  compareSourceHref,
} from "@/lib/landing-compare";
import { cn } from "@/lib/utils";

export type CompareTranslator = Awaited<ReturnType<typeof getTranslations<"landing.compare">>>;

const CAPTION_ID = "compare-caption";

const SOURCES_ID = "compare-sources-heading";

const REF_CLASS =
  "vk-compare-ref inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm px-1 font-mono text-xs text-(--accent) underline decoration-(--accent)/40 underline-offset-2 hover:decoration-(--accent) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-ring)";

export function footnoteId(footnote: CompareFootnote): string {
  return `compare-source-${footnote === "M" ? "m" : footnote}`;
}

export function FootnoteRefs({
  footnotes,
  t,
}: {
  footnotes: ReadonlyArray<CompareFootnote>;
  t: CompareTranslator;
}): ReactNode {
  return (
    <span className="ms-1 inline-flex flex-wrap gap-0.5 align-baseline" data-footnotes="">
      {footnotes.map((footnote) => (
        <a
          key={footnote}
          href={`#${footnoteId(footnote)}`}
          aria-label={
            footnote === "M"
              ? t("noteRef")
              : t("sourceRef", {
                  number: footnote,
                  tool: COMPARE_TOOL_NAMES[compareSource(footnote).tool],
                })
          }
          className={REF_CLASS}
        >
          {footnote}
        </a>
      ))}
    </span>
  );
}

function sourceText(href: string): string {
  return href.replace(/^https?:\/\//, "");
}

export function SourceList({
  t,
  locale,
  footnotes,
  heading: Heading = "h3",
  intro,
}: {
  t: CompareTranslator;
  locale: Locale;
  footnotes: ReadonlyArray<number>;
  heading?: "h2" | "h3";
  intro?: ReactNode;
}): ReactNode {
  return (
    <div className="grid gap-3">
      <Heading id={SOURCES_ID} className="text-sm font-medium text-(--text-strong)">
        {t("sources")}
      </Heading>
      {intro}
      <ol
        aria-labelledby={SOURCES_ID}
        className="grid list-decimal gap-x-10 gap-y-2 ps-8 text-xs leading-relaxed text-(--text-muted) lg:grid-cols-2"
      >
        {footnotes.map((footnote) => {
          const source = compareSource(footnote);
          return (
            <li key={footnote} id={footnoteId(footnote)} value={footnote} className="min-w-0 ps-1">
              <span className="text-(--text-body)">{COMPARE_TOOL_NAMES[source.tool]}: </span>
              {source.urls.map((link, index) => {
                const href = compareSourceHref(link, locale);
                return (
                  <span key={href}>
                    {index > 0 ? "; " : null}
                    <a href={href} className="vk-prose-link [overflow-wrap:anywhere]">
                      {sourceText(href)}
                    </a>
                  </span>
                );
              })}
            </li>
          );
        })}
      </ol>
      <p id={footnoteId("M")} className="max-w-[72ch] text-xs leading-relaxed text-(--text-muted)">
        <span className="font-mono text-(--text-body)">M </span>
        {t("manualNote")}
      </p>
    </div>
  );
}

export type CompareColumn = { readonly id: string; readonly label: string };

export type CompareCellContent = {
  readonly column: string;
  readonly content: ReactNode;
  readonly footnotes: ReadonlyArray<CompareFootnote>;
};

export type CompareTableRow = {
  readonly id: string;
  readonly label: string;
  readonly cells: ReadonlyArray<CompareCellContent>;
};

function CompareCell({ cell, t }: { cell: CompareCellContent; t: CompareTranslator }): ReactNode {
  const highlighted = cell.column === "verbatra";
  return (
    <td
      data-column={cell.column}
      className={cn(
        "px-4 py-3.5 align-top text-sm leading-relaxed",
        highlighted ? "text-(--text-strong)" : "text-(--text-body)",
      )}
      style={
        highlighted
          ? { background: "color-mix(in srgb, var(--accent) 6%, transparent)" }
          : undefined
      }
    >
      <span data-cell-text="">{cell.content}</span>
      <FootnoteRefs footnotes={cell.footnotes} t={t} />
    </td>
  );
}

export function CompareRegion({
  t,
  caption,
  columns,
  rows,
  tableClassName,
}: {
  t: CompareTranslator;
  caption: string;
  columns: ReadonlyArray<CompareColumn>;
  rows: ReadonlyArray<CompareTableRow>;
  tableClassName: string;
}): ReactNode {
  return (
    <>
      <p className="vk-compare-hint text-sm text-(--text-muted)">{t("scrollHint")}</p>
      <div className="relative min-w-0">
        <section
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the table scrolls sideways on a phone, so the keyboard needs a stop to scroll it
          tabIndex={0}
          aria-labelledby={CAPTION_ID}
          data-compare-scroll=""
          className="vk-compare-scroll relative overflow-x-auto overscroll-x-contain rounded-xl border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
          style={{
            borderColor: "var(--border-default)",
            scrollbarWidth: "thin",
            scrollbarColor: "var(--border-default) transparent",
          }}
        >
          <table className={cn("w-full border-collapse text-left", tableClassName)}>
            <caption id={CAPTION_ID} className="sr-only">
              {caption}
            </caption>
            <thead>
              <tr className="border-b" style={{ borderColor: "var(--border-default)" }}>
                <th
                  scope="col"
                  className="vk-compare-sticky sticky left-0 z-10 w-[16%] px-4 py-3 text-sm font-medium text-(--text-muted)"
                  style={{ background: "var(--surface-card)" }}
                >
                  {t("columns.criterion")}
                </th>
                {columns.map((column) => (
                  <th
                    key={column.id}
                    scope="col"
                    data-column={column.id}
                    className={cn(
                      "px-4 py-3 align-bottom text-sm font-semibold",
                      column.id === "verbatra" ? "text-(--accent)" : "text-(--text-strong)",
                    )}
                    style={{ background: "var(--surface-card)" }}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  data-row={row.id}
                  className="border-b last:border-b-0"
                  style={{ borderColor: "var(--border-default)" }}
                >
                  <th
                    scope="row"
                    className="vk-compare-sticky sticky left-0 z-10 px-4 py-3.5 align-top text-sm font-medium text-(--text-strong)"
                    style={{ background: "var(--surface-bg)" }}
                  >
                    {row.label}
                  </th>
                  {row.cells.map((cell) => (
                    <CompareCell key={cell.column} cell={cell} t={t} />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <span aria-hidden="true" className="vk-compare-fade" />
      </div>
    </>
  );
}
