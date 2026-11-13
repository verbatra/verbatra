import type { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { type CompareCellView, compareCellView } from "@/lib/compare-cells";
import type { Locale } from "@/lib/i18n";
import { withInlineCode } from "@/lib/inline-code-text";
import {
  COMPARE_ROWS,
  COMPARE_TOOL_NAMES,
  COMPARE_TOOLS,
  type CompareMark,
  type CompareRowId,
  type CompareTool,
  compareSourceHref,
} from "@/lib/landing-compare";
import { cn } from "@/lib/utils";

export type CompareTranslator = Awaited<ReturnType<typeof getTranslations<"landing.compare">>>;

export const COMPARE_CAPTION_ID = "compare-caption";

export function toolName(t: CompareTranslator, tool: CompareTool): string {
  return tool === "manual" ? t("columns.manual") : COMPARE_TOOL_NAMES[tool];
}

function toolDetail(t: CompareTranslator, tool: CompareTool): string | null {
  if (tool === "lingo") return t("columns.lingoDetail");
  if (tool === "manual") return t("columns.manualDetail");
  return null;
}

function Detail({ text }: { text: string | null }): ReactNode {
  return text === null ? null : <small className="vk-compare-detail">{text}</small>;
}

const MARK_PATHS: Readonly<Record<CompareMark, ReactNode>> = {
  yes: <path d="M3.5 8.5l3 3L12.5 5" />,
  no: <path d="M4.5 4.5l7 7M11.5 4.5l-7 7" />,
  partial: (
    <>
      <circle cx="8" cy="8" r="5.5" fill="none" />
      <path d="M8 2.5a5.5 5.5 0 0 0 0 11z" fill="currentColor" stroke="none" />
    </>
  ),
  unknown: (
    <>
      <circle cx="8" cy="8" r="5.5" fill="none" />
      <path d="M6.3 6.5a1.8 1.8 0 1 1 2.6 1.6c-.6.3-.9.7-.9 1.3" fill="none" />
      <circle cx="8" cy="11.2" r=".6" fill="currentColor" />
    </>
  ),
};

function VerdictMark({ mark }: { mark: CompareMark }): ReactNode {
  return (
    <svg
      className="vk-compare-mark"
      data-mark={mark}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {MARK_PATHS[mark]}
    </svg>
  );
}

function SourceLinks({
  view,
  tool,
  criterion,
  t,
  locale,
}: {
  view: CompareCellView;
  tool: CompareTool;
  criterion: string;
  t: CompareTranslator;
  locale: Locale;
}): ReactNode {
  if (view.urls.length === 0) return null;
  const name = toolName(t, tool);
  return (
    <span className="vk-compare-sources" data-sources="">
      {view.urls.map((link, index) => (
        <a
          key={compareSourceHref(link, locale)}
          href={compareSourceHref(link, locale)}
          data-source=""
          className="vk-compare-source"
        >
          <span className="sr-only">
            {view.urls.length === 1
              ? t("sourceLink", { tool: name, criterion })
              : t("sourceLinkNth", { tool: name, criterion, number: index + 1 })}
          </span>
          <svg
            viewBox="0 0 12 12"
            width="12"
            height="12"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            focusable="false"
          >
            <path d="M3.5 8.5l5-5M4.5 3.5h4v4" />
          </svg>
        </a>
      ))}
    </span>
  );
}

export function CompareCellBody({
  t,
  row,
  tool,
  locale,
}: {
  t: CompareTranslator;
  row: CompareRowId;
  tool: CompareTool;
  locale: Locale;
}): ReactNode {
  const view = compareCellView(t, row, tool);
  return (
    <span
      className="vk-compare-cell"
      data-cell={view.kind}
      data-verdict-mark={view.kind === "verdict" ? view.mark : undefined}
    >
      <span className="vk-compare-lead">
        {view.kind === "verdict" ? <VerdictMark mark={view.mark} /> : null}
        <span className="vk-compare-word" data-word="">
          {view.word}
        </span>
      </span>
      {view.note === null ? null : (
        <>
          {" "}
          <span className="vk-compare-note" data-note="">
            {withInlineCode(view.note)}
          </span>
        </>
      )}
      <SourceLinks
        view={view}
        tool={tool}
        criterion={t(`rows.${row}.label`)}
        t={t}
        locale={locale}
      />
    </span>
  );
}

export function CompareMatrix({
  t,
  locale,
  caption,
}: {
  t: CompareTranslator;
  locale: Locale;
  caption: string;
}): ReactNode {
  return (
    <table className="vk-compare-table" data-compare-matrix="">
      <caption id={COMPARE_CAPTION_ID} className="sr-only">
        {caption}
      </caption>
      <thead>
        <tr>
          <th scope="col" className="vk-compare-head vk-compare-criterion">
            {t("columns.criterion")}
          </th>
          {COMPARE_TOOLS.map((tool) => (
            <th
              key={tool}
              scope="col"
              data-column={tool}
              className={cn("vk-compare-head", tool === "verbatra" && "vk-compare-self")}
            >
              {toolName(t, tool)}
              <Detail text={toolDetail(t, tool)} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {COMPARE_ROWS.map((row) => (
          <tr key={row} data-row={row}>
            <th scope="row" className="vk-compare-criterion">
              {t(`rows.${row}.label`)}
              <Detail text={row === "formats" ? t("rows.formats.detail") : null} />
            </th>
            {COMPARE_TOOLS.map((tool) => (
              <td
                key={tool}
                data-column={tool}
                className={cn(tool === "verbatra" && "vk-compare-self")}
              >
                <CompareCellBody t={t} row={row} tool={tool} locale={locale} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ComparePairs({ t, locale }: { t: CompareTranslator; locale: Locale }): ReactNode {
  const pairTools = COMPARE_TOOLS.filter((tool) => tool !== "verbatra");
  return (
    <div className="vk-compare-pairs" data-compare-pairs="">
      {pairTools.map((tool, index) => (
        <details
          key={tool}
          className="vk-compare-pair"
          data-pair={tool}
          {...(index === 0 ? { "data-selected": "", open: true } : {})}
        >
          <summary className="vk-compare-pair-summary">
            {t("pairSummary", { tool: toolName(t, tool) })}
          </summary>
          <dl className="vk-compare-pair-rows">
            {COMPARE_ROWS.map((row) => (
              <div key={row} className="vk-compare-pair-row" data-row={row}>
                <dt>
                  {t(`rows.${row}.label`)}
                  <Detail text={row === "formats" ? t("rows.formats.detail") : null} />
                </dt>
                {(["verbatra", tool] as const).map((side) => (
                  <dd
                    key={side}
                    data-column={side}
                    className={cn(side === "verbatra" && "vk-compare-self")}
                  >
                    <span className="vk-compare-who">
                      {toolName(t, side)}
                      <Detail text={toolDetail(t, side)} />
                    </span>
                    <CompareCellBody t={t} row={row} tool={side} locale={locale} />
                  </dd>
                ))}
              </div>
            ))}
          </dl>
        </details>
      ))}
    </div>
  );
}
