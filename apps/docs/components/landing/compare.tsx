import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { IntentPrefetchLink } from "@/components/ui/intent-prefetch-link";
import { localizedPath, toLocale } from "@/lib/i18n";
import {
  COMPARE_LAST_CHECKED,
  COMPARE_PATH,
  CONCESSION_FOOTNOTES,
  HOSTED_TMS_NAMES,
  SHORT_COLUMNS,
  SHORT_ROWS,
  type ShortColumn,
  type ShortRowId,
  shortCellFootnotes,
  shortCellHasText,
  shortCellIsYes,
} from "@/lib/landing-compare";
import { formatLandingDate } from "@/lib/landing-date";
import { CompareRegion, type CompareTranslator, FootnoteRefs, TextWithRefs } from "./compare-table";
import { Section } from "./section";
import { SectionHead } from "./section-head";

function YesMark({ label }: { label: string }): ReactNode {
  return (
    <span className="vk-compare-yes" data-mark="yes">
      <svg
        aria-hidden="true"
        className="vk-compare-yes-glyph"
        viewBox="0 0 16 16"
        width="16"
        height="16"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M3 8.5 6.5 12 13 4.5" />
      </svg>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function shortCell(t: CompareTranslator, row: ShortRowId, column: ShortColumn) {
  return {
    column,
    text: shortCellHasText(row, column) ? t(`brief.${row}.${column}`) : "",
    ...(shortCellIsYes(row, column) ? { mark: <YesMark label={t("marks.yes")} /> } : {}),
    footnotes: shortCellFootnotes(row, column),
  };
}

export async function Compare(): Promise<ReactNode> {
  const t = await getTranslations("landing.compare");
  const locale = toLocale(await getLocale());
  const sourcesPage = localizedPath(locale, COMPARE_PATH);

  return (
    <Section band id="compare" labelledBy="compare-heading">
      <SectionHead id="compare-heading" title={t("heading")} lead={t("lead")} align="start" />
      <div className="vk-compare not-prose mt-(--head-gap) grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <CompareRegion
          t={t}
          caption={t("caption")}
          tableClassName="min-w-[48rem]"
          sourcesPage={sourcesPage}
          columns={SHORT_COLUMNS.map((column) => ({
            id: column,
            label: t(`columns.${column}`),
            ...(column === "hostedTms" ? { detail: HOSTED_TMS_NAMES } : {}),
          }))}
          rows={SHORT_ROWS.map((row) => ({
            id: row,
            label: t(`rows.${row}.label`),
            cells: SHORT_COLUMNS.map((column) => shortCell(t, row, column)),
          }))}
        />
        <div className="vk-compare-foot text-sm leading-relaxed text-(--text-muted)">
          <p data-concession="" className="max-w-[60ch]">
            <TextWithRefs
              text={t("concession")}
              refs={
                <FootnoteRefs footnotes={CONCESSION_FOOTNOTES} t={t} sourcesPage={sourcesPage} />
              }
            />
          </p>
          <p data-last-checked="">
            {`${t("lastChecked")} `}
            <time dateTime={COMPARE_LAST_CHECKED}>
              {formatLandingDate(COMPARE_LAST_CHECKED, locale)}
            </time>
          </p>
          <p>
            <IntentPrefetchLink href={sourcesPage} className="vk-prose-link text-base">
              {t("fullLink")}
            </IntentPrefetchLink>
          </p>
        </div>
      </div>
    </Section>
  );
}
