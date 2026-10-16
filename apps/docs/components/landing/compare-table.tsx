import type { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import type { Locale } from "@/lib/i18n";
import { withInlineCode } from "@/lib/inline-code-text";
import {
  COMPARE_TOOL_NAMES,
  type CompareFootnote,
  compareSource,
  compareSourceHref,
} from "@/lib/landing-compare";
import { cn } from "@/lib/utils";
import { breakUrlsAtSlashes } from "@/lib/word-breaks";
import { CompareFocus } from "./islands";

export type CompareTranslator = Awaited<ReturnType<typeof getTranslations<"landing.compare">>>;

const CAPTION_ID = "compare-caption";

const SOURCES_ID = "compare-sources-heading";

const REF_CLASS =
  "vk-compare-ref inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm px-1 font-mono text-xs text-(--accent) underline decoration-(--accent)/40 underline-offset-2 hover:decoration-(--accent) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-ring)";

const NO_BREAK_SPACE = "\u00a0";

function footnoteId(footnote: CompareFootnote): string {
  return `source-${footnote === "M" ? "m" : footnote}`;
}

export function FootnoteRefs({
  footnotes,
  t,
  sourcesPage = "",
}: {
  footnotes: ReadonlyArray<CompareFootnote>;
  t: CompareTranslator;
  sourcesPage?: string;
}): ReactNode {
  return (
    <>
      {NO_BREAK_SPACE}
      <span className="inline-flex flex-nowrap gap-0.5 align-baseline" data-footnotes="">
        {footnotes.map((footnote) => (
          <a
            key={footnote}
            href={`${sourcesPage}#${footnoteId(footnote)}`}
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
    </>
  );
}

export function SourceList({
  t,
  locale,
  footnotes,
  intro,
}: {
  t: CompareTranslator;
  locale: Locale;
  footnotes: ReadonlyArray<number>;
  intro?: ReactNode;
}): ReactNode {
  return (
    <div className="grid gap-3">
      <h2 id={SOURCES_ID} className="text-sm font-medium text-(--text-strong)">
        {t("sources")}
      </h2>
      {intro}
      <ol
        aria-labelledby={SOURCES_ID}
        className="list-inside list-decimal gap-x-10 text-xs leading-relaxed text-(--text-muted) lg:columns-2"
      >
        {footnotes.map((footnote) => {
          const source = compareSource(footnote);
          return (
            <li
              key={footnote}
              id={footnoteId(footnote)}
              value={footnote}
              className="vk-compare-source mb-2 min-w-0 break-inside-avoid ps-8 -indent-8"
            >
              <span className="text-(--text-body)">{COMPARE_TOOL_NAMES[source.tool]}: </span>
              {source.urls.map((link, index) => {
                const href = compareSourceHref(link, locale);
                return (
                  <span key={href}>
                    {index > 0 ? "; " : null}
                    <a href={href} className="vk-prose-link">
                      {breakUrlsAtSlashes(href)}
                    </a>
                  </span>
                );
              })}
            </li>
          );
        })}
      </ol>
      <p
        id={footnoteId("M")}
        className="vk-compare-source max-w-[72ch] text-xs leading-relaxed text-(--text-muted)"
      >
        <span className="font-mono text-(--text-body)">M </span>
        {t("manualNote")}
      </p>
    </div>
  );
}

type CompareColumn = { readonly id: string; readonly label: string };

type CompareCellContent = {
  readonly column: string;
  readonly text: string;
  readonly content?: ReactNode;
  readonly footnotes: ReadonlyArray<CompareFootnote>;
};

type CompareTableRow = {
  readonly id: string;
  readonly label: string;
  readonly cells: ReadonlyArray<CompareCellContent>;
};

const WORD_CHARACTER = /[\p{L}\p{N}]/u;

function splitLastWord(text: string): readonly [string, string] {
  let index = text.lastIndexOf(" ");
  while (index > 0 && !WORD_CHARACTER.test(text.slice(index + 1))) {
    index = text.lastIndexOf(" ", index - 1);
  }
  const tail = text.slice(index + 1);
  if (tail.split("`").length % 2 === 0) return [text, ""];
  return [text.slice(0, index + 1), tail];
}

function CellText({ cell, refs }: { cell: CompareCellContent; refs: ReactNode }): ReactNode {
  if (cell.content !== undefined)
    return (
      <>
        <span data-cell-text="">{cell.content}</span>
        {refs}
      </>
    );
  return (
    <span data-cell-text="">
      <TextWithRefs text={cell.text} refs={refs} />
    </span>
  );
}

export function TextWithRefs({ text, refs }: { text: string; refs: ReactNode }): ReactNode {
  const [head, tail] = splitLastWord(text);
  return (
    <>
      {withInlineCode(head)}
      <span className="whitespace-nowrap">
        {withInlineCode(tail)}
        {refs}
      </span>
    </>
  );
}

function CompareCell({
  cell,
  t,
  sourcesPage,
}: {
  cell: CompareCellContent;
  t: CompareTranslator;
  sourcesPage: string;
}): ReactNode {
  const marked = cell.column === "verbatra";
  return (
    <td
      data-column={cell.column}
      className={cn(
        "px-4 py-3.5 align-top text-sm leading-relaxed",
        marked ? "vk-compare-mark font-medium text-(--text-strong)" : "text-(--text-body)",
      )}
    >
      <CellText
        cell={cell}
        refs={<FootnoteRefs footnotes={cell.footnotes} t={t} sourcesPage={sourcesPage} />}
      />
    </td>
  );
}

export function CompareRegion({
  t,
  caption,
  columns,
  rows,
  tableClassName,
  sourcesPage = "",
}: {
  t: CompareTranslator;
  caption: string;
  columns: ReadonlyArray<CompareColumn>;
  rows: ReadonlyArray<CompareTableRow>;
  tableClassName: string;
  sourcesPage?: string;
}): ReactNode {
  return (
    <>
      <p className="vk-compare-hint text-sm text-(--text-muted)">{t("scrollHint")}</p>
      <CompareFocus />
      <div className="relative min-w-0">
        <section
          // biome-ignore lint/a11y/noNoninteractiveTabindex: the table scrolls sideways on a phone, so the keyboard needs a stop to scroll it
          tabIndex={0}
          aria-labelledby={CAPTION_ID}
          data-compare-scroll=""
          className="vk-compare-scroll relative overflow-x-auto overscroll-x-contain focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)"
        >
          <table
            className={cn("vk-compare-table w-full border-collapse text-left", tableClassName)}
          >
            <caption id={CAPTION_ID} className="sr-only">
              {caption}
            </caption>
            <thead>
              <tr>
                <th
                  scope="col"
                  className="vk-compare-sticky sticky left-0 z-10 px-4 py-3 align-bottom text-sm font-medium text-(--text-muted)"
                >
                  {t("columns.criterion")}
                </th>
                {columns.map((column) => (
                  <th
                    key={column.id}
                    scope="col"
                    data-column={column.id}
                    className={cn(
                      "px-4 py-3 align-bottom text-sm font-medium",
                      column.id === "verbatra"
                        ? "vk-compare-mark text-(--accent)"
                        : "text-(--text-strong)",
                    )}
                  >
                    {column.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} data-row={row.id}>
                  <th
                    scope="row"
                    className="vk-compare-sticky sticky left-0 z-10 px-4 py-3.5 align-top text-sm font-medium text-(--text-strong)"
                  >
                    {row.label}
                  </th>
                  {row.cells.map((cell) => (
                    <CompareCell key={cell.column} cell={cell} t={t} sourcesPage={sourcesPage} />
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
