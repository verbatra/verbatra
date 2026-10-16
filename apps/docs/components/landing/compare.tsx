import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { IntentPrefetchLink } from "@/components/ui/intent-prefetch-link";
import { localizedPath, toLocale } from "@/lib/i18n";
import {
  COMPARE_LAST_CHECKED,
  COMPARE_PATH,
  CONCESSION_FOOTNOTES,
  SHORT_COLUMNS,
  SHORT_ROWS,
  shortCellFootnotes,
} from "@/lib/landing-compare";
import { CompareRegion, FootnoteRefs, TextWithRefs } from "./compare-table";
import { formatLandingDate } from "./hero-facts";
import { Section } from "./section";
import { SectionHead } from "./section-head";

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
          tableClassName="min-w-[56rem]"
          sourcesPage={sourcesPage}
          columns={SHORT_COLUMNS.map((column) => ({
            id: column,
            label: t(`columns.${column}`),
          }))}
          rows={SHORT_ROWS.map((row) => ({
            id: row,
            label: t(`rows.${row}.label`),
            cells: SHORT_COLUMNS.map((column) => ({
              column,
              text: t(`rows.${row}.${column}`),
              footnotes: shortCellFootnotes(row, column),
            })),
          }))}
        />
        <div className="vk-grid-12 mt-4 text-sm leading-relaxed text-(--text-muted)">
          <div className="grid max-w-[72ch] gap-3 lg:[--grid-span:8]">
            <p data-fairness="">{t("fairness")}</p>
            <p data-concession="">
              <TextWithRefs
                text={t("concession")}
                refs={
                  <FootnoteRefs footnotes={CONCESSION_FOOTNOTES} t={t} sourcesPage={sourcesPage} />
                }
              />
            </p>
          </div>
          <div className="grid content-start gap-3 lg:[--grid-span:4]">
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
      </div>
    </Section>
  );
}
