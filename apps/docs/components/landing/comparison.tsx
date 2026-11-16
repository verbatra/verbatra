import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { toLocale } from "@/lib/i18n";
import {
  COMPARISON_ANCHOR,
  COMPARISON_LAST_CHECKED,
  COMPARISON_ROWS,
  COMPARISON_SHORT_VENDOR_NAMES,
  COMPARISON_TOOLS,
  COMPARISON_VENDOR_NAMES,
  COMPARISON_VERDICTS,
  type ComparisonRow,
  type ComparisonTool,
  type ComparisonVerdict,
  comparisonCell,
} from "@/lib/landing-comparison";
import { formatLandingDate } from "@/lib/landing-date";
import { cn } from "@/lib/utils";
import { breakBetweenWords } from "@/lib/word-segments";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const HEADING_ID = `${COMPARISON_ANCHOR}-heading`;

const MARK_PATHS: Readonly<Record<ComparisonVerdict, ReactNode>> = {
  yes: <path d="M2 8.5l4.5 4.5L14.5 3" />,
  no: <path d="M3 3l10 10M13 3L3 13" />,
  partial: (
    <>
      <circle cx="8" cy="8" r="6" fill="none" />
      <path d="M8 2a6 6 0 0 0 0 12z" fill="currentColor" stroke="none" />
    </>
  ),
};

function VerdictMark({ verdict }: { verdict: ComparisonVerdict }): ReactNode {
  return (
    <svg
      className="vk-comparison-mark"
      data-mark={verdict}
      viewBox="0 0 16 16"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {MARK_PATHS[verdict]}
    </svg>
  );
}

type Translate = Awaited<ReturnType<typeof getTranslations<"landing.comparison">>>;

function ownColumn(tool: ComparisonTool): string | undefined {
  return tool === "verbatra" ? "vk-comparison-self" : undefined;
}

type HeadLabels = {
  long: string;
  short?: string;
  swap: "vk-comparison-swap-sm" | "vk-comparison-swap-lg";
};

function headLabels(tool: ComparisonTool, t: Translate): HeadLabels {
  if (tool === "manual")
    return {
      long: t("columns.manual"),
      short: t("columns.manualShort"),
      swap: "vk-comparison-swap-lg",
    };
  const short = COMPARISON_SHORT_VENDOR_NAMES[tool];
  return short === undefined
    ? { long: COMPARISON_VENDOR_NAMES[tool], swap: "vk-comparison-swap-sm" }
    : { long: COMPARISON_VENDOR_NAMES[tool], short, swap: "vk-comparison-swap-sm" };
}

function ToolHead({ tool, t }: { tool: ComparisonTool; t: Translate }): ReactNode {
  const { long, short, swap } = headLabels(tool, t);
  return (
    <th scope="col" className={cn(ownColumn(tool), short !== undefined && swap)}>
      {short === undefined ? (
        long
      ) : (
        <>
          <span className="vk-comparison-long">{long}</span>
          <span className="vk-comparison-short" aria-hidden="true">
            {short}
          </span>
        </>
      )}
    </th>
  );
}

function RowBody({ row, t }: { row: ComparisonRow; t: Translate }): ReactNode {
  const label = t(`rows.${row}`);
  return (
    <tbody>
      {/* biome-ignore lint/a11y/noAriaHiddenOnFocusable: a table row is not focusable, and the real row header carries the label for assistive technology. */}
      <tr className="vk-comparison-label" aria-hidden="true">
        <td colSpan={COMPARISON_TOOLS.length + 1}>{breakBetweenWords(label)}</td>
      </tr>
      <tr>
        <th scope="row">
          <span className="vk-comparison-row-label">{label}</span>
        </th>
        {COMPARISON_TOOLS.map((tool) => {
          const { verdict } = comparisonCell(row, tool);
          return (
            <td key={tool} className={ownColumn(tool)}>
              <VerdictMark verdict={verdict} />
              <span className="sr-only">{t(`verdicts.${verdict}`)}</span>
            </td>
          );
        })}
      </tr>
    </tbody>
  );
}

function Legend({ t }: { t: Translate }): ReactNode {
  return (
    <ul className="vk-comparison-legend" aria-hidden="true">
      {COMPARISON_VERDICTS.map((verdict) => (
        <li key={verdict} className="vk-comparison-legend-item">
          <VerdictMark verdict={verdict} /> {t(`verdicts.${verdict}`)}
        </li>
      ))}
    </ul>
  );
}

export async function Comparison(): Promise<ReactNode> {
  const t = await getTranslations("landing.comparison");
  const locale = toLocale(await getLocale());
  return (
    <Section id={COMPARISON_ANCHOR} labelledBy={HEADING_ID} className="vk-comparison">
      <SectionHead id={HEADING_ID} title={t("heading")} lead={t("lead")} align="start" />
      <div className="vk-comparison-card" data-reveal={0}>
        <div className="vk-comparison-frame">
          <span className="vk-comparison-bar" aria-hidden="true" />
          <table className="vk-comparison-table">
            <caption className="sr-only">{t("caption")}</caption>
            <thead>
              <tr>
                <th scope="col">
                  <span className="sr-only">{t("columns.question")}</span>
                </th>
                {COMPARISON_TOOLS.map((tool) => (
                  <ToolHead key={tool} tool={tool} t={t} />
                ))}
              </tr>
            </thead>
            {COMPARISON_ROWS.map((row) => (
              <RowBody key={row} row={row} t={t} />
            ))}
          </table>
        </div>
      </div>
      <div className="vk-comparison-foot">
        <Legend t={t} />
        <p className="vk-comparison-checked" data-last-checked="">
          {t("lastChecked", { date: formatLandingDate(COMPARISON_LAST_CHECKED, locale) })}
        </p>
      </div>
    </Section>
  );
}
