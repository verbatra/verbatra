import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { withInlineCode } from "@/lib/inline-code-text";
import {
  COMPARE_COLUMNS,
  COMPARE_ROWS,
  type CompareColumn,
  type CompareMark,
} from "@/lib/landing-compare";
import { cn } from "@/lib/utils";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const CAPTION_ID = "compare-caption";

const MARK_COLOR: Readonly<Record<CompareMark, string>> = {
  yes: "var(--accent)",
  partial: "var(--text-muted)",
  no: "var(--text-faint)",
};

function MarkGlyph({ mark }: { mark: CompareMark }): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      className="mt-0.5 shrink-0"
      style={{ color: MARK_COLOR[mark] }}
      data-mark-glyph={mark}
    >
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {mark === "yes" ? (
        <path
          d="M5 8.2 7 10.2 11 6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : null}
      {mark === "partial" ? <path d="M8 1.5a6.5 6.5 0 0 1 0 13Z" fill="currentColor" /> : null}
      {mark === "no" ? (
        <path d="M5.5 8h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

function CompareCell({
  column,
  text,
  mark,
}: {
  column: CompareColumn;
  text: string;
  mark: { readonly id: CompareMark; readonly label: string } | undefined;
}): ReactNode {
  const highlighted = column === "verbatra";
  return (
    <td
      data-column={column}
      data-mark={mark?.id}
      className={cn(
        "px-4 py-3.5 align-top text-sm leading-relaxed",
        highlighted ? "text-[color:var(--text-strong)]" : "text-[color:var(--text-body)]",
      )}
      style={
        highlighted
          ? { background: "color-mix(in srgb, var(--accent) 6%, transparent)" }
          : undefined
      }
    >
      <span className="flex gap-2.5">
        {mark ? <MarkGlyph mark={mark.id} /> : null}
        <span>
          {mark ? <span className="sr-only">{`${mark.label}: `}</span> : null}
          {withInlineCode(text)}
        </span>
      </span>
    </td>
  );
}

export async function Compare(): Promise<ReactNode> {
  const t = await getTranslations("landing.compare");

  return (
    <Section band id="compare">
      <SectionHead id="compare-heading" title={t("heading")} />
      <div className="vk-compare not-prose mt-10 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4">
        <p className="vk-compare-hint text-sm text-[color:var(--text-muted)]">{t("scrollHint")}</p>
        <div className="relative min-w-0">
          <section
            // biome-ignore lint/a11y/noNoninteractiveTabindex: the table scrolls sideways on a phone, so the keyboard needs a stop to scroll it
            tabIndex={0}
            aria-labelledby={CAPTION_ID}
            data-compare-scroll=""
            className="vk-compare-scroll relative overflow-x-auto overscroll-x-contain rounded-xl border focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[color:var(--focus-ring)]"
            style={{
              borderColor: "var(--border-default)",
              scrollbarWidth: "thin",
              scrollbarColor: "var(--border-default) transparent",
            }}
          >
            <table className="w-full min-w-[46rem] border-collapse text-left">
              <caption id={CAPTION_ID} className="sr-only">
                {t("caption")}
              </caption>
              <thead>
                <tr className="border-b" style={{ borderColor: "var(--border-default)" }}>
                  <th
                    scope="col"
                    className="vk-compare-sticky sticky left-0 z-10 w-[22%] px-4 py-3 text-sm font-medium text-[color:var(--text-muted)]"
                    style={{ background: "var(--surface-card)" }}
                  >
                    {t("columns.aspect")}
                  </th>
                  {COMPARE_COLUMNS.map((column) => (
                    <th
                      key={column}
                      scope="col"
                      data-column={column}
                      className={cn(
                        "px-4 py-3 text-sm font-semibold",
                        column === "verbatra"
                          ? "text-[color:var(--accent)]"
                          : "text-[color:var(--text-strong)]",
                      )}
                      style={{ background: "var(--surface-card)" }}
                    >
                      {t(`columns.${column}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARE_ROWS.map((row) => (
                  <tr
                    key={row.id}
                    className="border-b last:border-b-0"
                    style={{ borderColor: "var(--border-default)" }}
                  >
                    <th
                      scope="row"
                      className="vk-compare-sticky sticky left-0 z-10 px-4 py-3.5 align-top text-sm font-medium text-[color:var(--text-strong)]"
                      style={{ background: "var(--surface-bg)" }}
                    >
                      {t(`rows.${row.id}.label`)}
                    </th>
                    {COMPARE_COLUMNS.map((column) => {
                      const mark = row.marks?.[column];
                      return (
                        <CompareCell
                          key={column}
                          column={column}
                          text={t(`rows.${row.id}.${column}`)}
                          mark={mark ? { id: mark, label: t(`marks.${mark}`) } : undefined}
                        />
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
          <span aria-hidden="true" className="vk-compare-fade" />
        </div>
        <p className="max-w-[72ch] text-sm text-[color:var(--text-muted)]">{t("note")}</p>
      </div>
    </Section>
  );
}
