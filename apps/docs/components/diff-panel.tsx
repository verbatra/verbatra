"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { prefersReducedMotion } from "@/lib/reduced-motion";
import { useInView } from "@/lib/use-in-view";

type Row = {
  key: string;
  source: string;
  target: string;
  changed?: boolean;
};

const DEFAULT_ROWS: ReadonlyArray<Row> = [
  { key: "cart.checkout", source: "Checkout", target: "Zur Kasse", changed: true },
  { key: "cart.empty", source: "Empty", target: "Leer" },
  { key: "cart.total", source: "Total", target: "Gesamt" },
];

export function DiffPanel({
  rows = DEFAULT_ROWS,
  sourceFile = "en.json",
  targetFile = "de.json",
  tag = "verbatra translate",
}: {
  rows?: ReadonlyArray<Row>;
  sourceFile?: string;
  targetFile?: string;
  tag?: string;
}) {
  const t = useTranslations("docs.diffPanel");
  const changed = rows.find((r) => r.changed);
  const full = changed?.target ?? "";

  const [count, setCount] = useState(0);
  const [settled, setSettled] = useState(false);
  const [ref, inView] = useInView<HTMLElement>(0.5, { once: true });

  useEffect(() => {
    if (!full || prefersReducedMotion()) {
      setCount(full.length);
      setSettled(true);
      return;
    }
    if (!inView) return;

    let i = 0;
    let settleTimer: ReturnType<typeof setTimeout> | undefined;
    const typer: ReturnType<typeof setInterval> = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= full.length) {
        clearInterval(typer);
        settleTimer = setTimeout(() => setSettled(true), 450);
      }
    }, 55);

    return () => {
      clearInterval(typer);
      if (settleTimer) clearTimeout(settleTimer);
    };
  }, [full, inView]);

  const typed = full.slice(0, count);
  const typing = count > 0 && count < full.length;
  const changedStyle = settled
    ? { color: "var(--accent)" }
    : {
        color: "var(--accent-fill)",
        textShadow: "0 0 10px color-mix(in srgb, var(--accent-fill) 55%, transparent)",
      };

  return (
    <figure
      ref={ref}
      aria-label={t("label")}
      className="not-prose relative my-8 rounded-xl border border-(--border-default) bg-(--surface-card) p-5 font-mono text-sm sm:p-7"
      style={{
        borderInlineStart: "2px solid var(--accent)",
        boxShadow: "var(--shadow-panel)",
      }}
    >
      <span className="absolute -top-2.5 left-5 rounded-md border border-(--border-default) bg-(--surface-bg) px-2 py-0.5 text-xs uppercase tracking-wider text-(--text-muted)">
        {tag}
      </span>
      <div className="grid grid-cols-2 gap-x-6 gap-y-3.5">
        <div className="text-xs text-(--text-muted)">{sourceFile}</div>
        <div className="text-xs text-(--text-muted)">{targetFile}</div>

        {rows.map((row) => (
          <DiffRow
            key={row.key}
            row={row}
            typed={typed}
            typing={typing}
            changedStyle={changedStyle}
          />
        ))}
      </div>
      <figcaption className="mt-4 text-xs text-(--text-muted)">{t("caption")}</figcaption>
    </figure>
  );
}

function DiffRow({
  row,
  typed,
  typing,
  changedStyle,
}: {
  row: Row;
  typed: string;
  typing: boolean;
  changedStyle: React.CSSProperties;
}) {
  return (
    <>
      <div className="text-(--text-faint)">
        <span className="text-(--text-muted)">&quot;{row.key}&quot;</span>: &quot;
        {row.source}&quot;
      </div>
      <div className={row.changed ? "" : "text-(--text-faint)"}>
        <span className="text-(--text-muted)">&quot;{row.key}&quot;</span>:{" "}
        {row.changed ? (
          <span style={changedStyle}>
            &quot;{typed}&quot;
            {typing ? <span className="opacity-70">▍</span> : null}
          </span>
        ) : (
          <span>&quot;{row.target}&quot;</span>
        )}
      </div>
    </>
  );
}
