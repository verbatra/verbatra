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
import { isSpaceless, lastWordStart, SPACELESS_SCRIPT } from "@/lib/word-count";
import { breakBetweenWords } from "@/lib/word-segments";

export type CompareTranslator = Awaited<ReturnType<typeof getTranslations<"landing.compare">>>;

export function toolName(t: CompareTranslator, tool: CompareTool): string {
  return tool === "manual" ? t("columns.manual") : COMPARE_TOOL_NAMES[tool];
}

function toolDetail(t: CompareTranslator, tool: CompareTool): string | null {
  if (tool === "lingo") return t("columns.lingoDetail");
  if (tool === "manual") return t("columns.manualDetail");
  return null;
}

export function criterionLabel(label: string, locale: Locale): ReactNode {
  return isSpaceless(locale) ? breakBetweenWords(label) : label;
}

function Detail({ text, locale }: { text: string | null; locale: Locale }): ReactNode {
  return text === null ? null : (
    <small className="vk-compare-detail">{criterionLabel(text, locale)}</small>
  );
}

function PairDetail({ text }: { text: string | null }): ReactNode {
  return text === null ? null : <p className="vk-compare-pair-detail">{text}</p>;
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

function sourceLinks({
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
}): ReadonlyArray<ReactNode> {
  const name = toolName(t, tool);
  return view.urls.map((link, index) => (
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
  ));
}

function Unit({ children }: { children: ReactNode }): ReactNode {
  return <span className="vk-compare-unit">{children}</span>;
}

const TAIL_SEGMENT = /[^\s\-/]*$/;
const OPENING_PUNCTUATION = /[\p{Ps}\p{Pi}]$/u;

const PREVIOUS_CHUNK = /\S+\s*$/;

function isLoneSpacedCharacter(text: string, start: number): boolean {
  const tail = text.slice(start);
  return [...tail].length === 1 && SPACELESS_SCRIPT.test(tail) && /\s$/.test(text.slice(0, start));
}

const MAX_PREVIOUS_CHUNK = 6;

function previousChunkStart(text: string, start: number): number {
  const previous = text.slice(0, start).search(PREVIOUS_CHUNK);
  return previous === -1 || [...text.slice(previous, start).trimEnd()].length > MAX_PREVIOUS_CHUNK
    ? start
    : previous;
}

function tailCut(text: string, locale: string): number {
  const cut = text.search(TAIL_SEGMENT);
  if (!isSpaceless(locale)) return cut;
  let start = Math.max(cut, lastWordStart(text, locale));
  while (start > cut && OPENING_PUNCTUATION.test(text.slice(0, start))) start -= 1;
  return isLoneSpacedCharacter(text, start) ? previousChunkStart(text, start) : start;
}

function WordWithMark({
  word,
  mark,
  arrow,
  locale,
}: {
  word: string;
  mark: ReactNode;
  arrow: ReactNode;
  locale: string;
}): ReactNode {
  const cut = tailCut(word, locale);
  const head = word.slice(0, cut);
  const tail = word.slice(cut);
  if (mark === null)
    return (
      <>
        {head}
        <Unit>
          {tail}
          {arrow}
        </Unit>
      </>
    );
  const lead = /^\S+/.exec(head)?.[0] ?? "";
  if (lead === "")
    return (
      <Unit>
        {mark}
        {tail}
        {arrow}
      </Unit>
    );
  return (
    <>
      <Unit>
        {mark}
        {lead}
      </Unit>
      {head.slice(lead.length)}
      <Unit>
        {tail}
        {arrow}
      </Unit>
    </>
  );
}

export function arrowCut(note: string, locale = "en"): number {
  const cut = tailCut(note, locale);
  const closing = note.lastIndexOf("`") + 1;
  const tailOpensCode = (note.slice(cut).match(/`/g)?.length ?? 0) % 2 === 1;
  return tailOpensCode && closing > cut && closing < note.length ? closing : cut;
}

const WORD_JOINER = "\u2060";

export function NoteWithArrow({
  note,
  arrow,
  locale,
}: {
  note: string;
  arrow: ReactNode;
  locale: string;
}): ReactNode {
  const cut = arrowCut(note, locale);
  const tail = note.slice(cut);
  if ((tail.match(/`/g)?.length ?? 0) % 2 === 1)
    return (
      <>
        {withInlineCode(note)}
        <Unit>
          {isSpaceless(locale) ? WORD_JOINER : null}
          {arrow}
        </Unit>
      </>
    );
  const spaceless = isSpaceless(locale);
  const head = withInlineCode(note.slice(0, cut));
  return (
    <>
      {spaceless ? breakBetweenWords(head) : head}
      {spaceless && cut > 0 ? <wbr /> : null}
      <Unit>
        {withInlineCode(tail)}
        {arrow}
      </Unit>
    </>
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
  const arrows = sourceLinks({
    view,
    tool,
    criterion: t(`rows.${row}.label`),
    t,
    locale,
  });
  const mark = view.kind === "verdict" ? <VerdictMark mark={view.mark} /> : null;
  return (
    <span
      className="vk-compare-cell"
      data-cell={view.kind}
      data-verdict-mark={view.kind === "verdict" ? view.mark : undefined}
    >
      <span className="vk-compare-word" data-word="">
        <WordWithMark
          word={view.word}
          mark={mark}
          arrow={view.note === null ? arrows : null}
          locale={locale}
        />
      </span>
      {view.note === null ? null : (
        <>
          {" "}
          <span className="vk-compare-note" data-note="">
            <NoteWithArrow note={view.note} arrow={arrows} locale={locale} />
          </span>
        </>
      )}
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
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr>
          <th scope="col" className="vk-compare-head vk-compare-criterion">
            {criterionLabel(t("columns.criterion"), locale)}
          </th>
          {COMPARE_TOOLS.map((tool) => (
            <th
              key={tool}
              scope="col"
              data-column={tool}
              className={cn("vk-compare-head", tool === "verbatra" && "vk-compare-self")}
            >
              {toolName(t, tool)}
              <Detail text={toolDetail(t, tool)} locale={locale} />
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {COMPARE_ROWS.map((row) => (
          <tr key={row} data-row={row}>
            <th scope="row" className="vk-compare-criterion">
              {criterionLabel(t(`rows.${row}.label`), locale)}
              <Detail text={row === "formats" ? t("rows.formats.detail") : null} locale={locale} />
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
            <span aria-hidden="true" className="vk-faq-mark" />
          </summary>
          <PairDetail text={toolDetail(t, tool)} />
          <dl className="vk-compare-pair-rows">
            {COMPARE_ROWS.map((row) => (
              <div key={row} className="vk-compare-pair-row" data-row={row}>
                <dt>
                  {criterionLabel(t(`rows.${row}.label`), locale)}
                  <Detail
                    text={row === "formats" ? t("rows.formats.detail") : null}
                    locale={locale}
                  />
                </dt>
                {(["verbatra", tool] as const).map((side) => (
                  <dd
                    key={side}
                    data-column={side}
                    className={cn(side === "verbatra" && "vk-compare-self")}
                  >
                    <span className="vk-compare-who">{toolName(t, side)}</span>
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
