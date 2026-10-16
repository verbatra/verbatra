import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { IntentPrefetchLink } from "@/components/ui/intent-prefetch-link";
import { type Locale, localizedAnchorPath, localizedPath, toLocale } from "@/lib/i18n";
import { withInlineCode } from "@/lib/inline-code-text";
import {
  COMPARE_LAST_CHECKED,
  COMPARE_TOOL_NAMES,
  type CompareFootnote,
  type CompareSourceLink,
  compareSource,
  SHORT_COLUMNS,
  SHORT_CONCESSION_FOOTNOTES,
  SHORT_ROWS,
  type ShortColumn,
  shortCellFootnotes,
  shortTableFootnotes,
} from "@/lib/landing-compare";
import { cn } from "@/lib/utils";
import { formatLandingDate } from "./hero-facts";
import { Section } from "./section";
import { SectionHead } from "./section-head";

type CompareTranslator = Awaited<ReturnType<typeof getTranslations<"landing.compare">>>;

const CAPTION_ID = "compare-caption";

const SOURCES_ID = "compare-sources-heading";

const REF_CLASS =
  "vk-compare-ref inline-flex min-h-6 min-w-6 items-center justify-center rounded-sm px-1 font-mono text-xs text-(--accent) underline decoration-(--accent)/40 underline-offset-2 hover:decoration-(--accent) focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-(--focus-ring)";

function footnoteId(footnote: CompareFootnote): string {
  return `compare-source-${footnote === "M" ? "m" : footnote}`;
}

function FootnoteRefs({
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

function sourceHref(link: CompareSourceLink, locale: Locale): string {
  return typeof link === "string" ? link : localizedAnchorPath(locale, link.page, link.anchors);
}

function sourceText(href: string): string {
  return href.replace(/^https?:\/\//, "");
}

function SourceList({ t, locale }: { t: CompareTranslator; locale: Locale }): ReactNode {
  return (
    <div className="grid gap-3">
      <h3 id={SOURCES_ID} className="text-sm font-medium text-(--text-strong)">
        {t("sources")}
      </h3>
      <ol
        aria-labelledby={SOURCES_ID}
        className="grid list-decimal gap-x-10 gap-y-2 ps-8 text-xs leading-relaxed text-(--text-muted) lg:grid-cols-2"
      >
        {shortTableFootnotes().map((footnote) => {
          const source = compareSource(footnote);
          return (
            <li key={footnote} id={footnoteId(footnote)} value={footnote} className="min-w-0 ps-1">
              <span className="text-(--text-body)">{COMPARE_TOOL_NAMES[source.tool]}: </span>
              {source.urls.map((link, index) => {
                const href = sourceHref(link, locale);
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

function CompareCell({
  column,
  text,
  footnotes,
  t,
}: {
  column: ShortColumn;
  text: string;
  footnotes: ReadonlyArray<CompareFootnote>;
  t: CompareTranslator;
}): ReactNode {
  const highlighted = column === "verbatra";
  return (
    <td
      data-column={column}
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
      <span data-cell-text="">{withInlineCode(text)}</span>
      <FootnoteRefs footnotes={footnotes} t={t} />
    </td>
  );
}

export async function Compare(): Promise<ReactNode> {
  const t = await getTranslations("landing.compare");
  const locale = toLocale(await getLocale());

  return (
    <Section band id="compare" labelledBy="compare-heading">
      <SectionHead id="compare-heading" title={t("heading")} />
      <div className="vk-compare not-prose mt-(--head-gap) grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
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
            <table className="w-full min-w-[56rem] border-collapse text-left">
              <caption id={CAPTION_ID} className="sr-only">
                {t("caption")}
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
                  {SHORT_COLUMNS.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      data-column={column}
                      className={cn(
                        "px-4 py-3 align-bottom text-sm font-semibold",
                        column === "verbatra" ? "text-(--accent)" : "text-(--text-strong)",
                      )}
                      style={{ background: "var(--surface-card)" }}
                    >
                      {t(`columns.${column}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {SHORT_ROWS.map((row) => (
                  <tr
                    key={row}
                    data-row={row}
                    className="border-b last:border-b-0"
                    style={{ borderColor: "var(--border-default)" }}
                  >
                    <th
                      scope="row"
                      className="vk-compare-sticky sticky left-0 z-10 px-4 py-3.5 align-top text-sm font-medium text-(--text-strong)"
                      style={{ background: "var(--surface-bg)" }}
                    >
                      {t(`rows.${row}.label`)}
                    </th>
                    {SHORT_COLUMNS.map((column) => (
                      <CompareCell
                        key={column}
                        column={column}
                        text={t(`rows.${row}.${column}`)}
                        footnotes={shortCellFootnotes(row, column)}
                        t={t}
                      />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <span aria-hidden="true" className="vk-compare-fade" />
        </div>
        <div className="grid max-w-[72ch] gap-3 text-sm leading-relaxed text-(--text-muted)">
          <p data-last-checked="">
            {`${t("lastChecked")} `}
            <time dateTime={COMPARE_LAST_CHECKED}>
              {formatLandingDate(COMPARE_LAST_CHECKED, locale)}
            </time>
          </p>
          <p data-fairness="">{t("fairness")}</p>
          <p data-concession="">
            {t("concession")}
            <FootnoteRefs footnotes={SHORT_CONCESSION_FOOTNOTES} t={t} />
          </p>
          <p>
            <IntentPrefetchLink
              href={localizedPath(locale, "/compare")}
              className="vk-prose-link text-base"
            >
              {t("fullLink")}
            </IntentPrefetchLink>
          </p>
        </div>
        <SourceList t={t} locale={locale} />
      </div>
    </Section>
  );
}
