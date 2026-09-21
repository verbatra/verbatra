"use client";

import { motion } from "motion/react";
import { Fragment, type ReactNode } from "react";
import { useReducedMotionPreference } from "@/lib/reduced-motion";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as const;
const VIEWPORT = { once: true, amount: 0.3 } as const;

type FromTarget = { opacity?: number; x?: number; y?: number };

function Panel({ children, className }: { children: ReactNode; className?: string }): ReactNode {
  return (
    <div className={cn("w-full font-mono text-[13px] leading-relaxed", className)}>{children}</div>
  );
}

function Reveal({
  children,
  className,
  reduced,
  delay = 0,
  from = { opacity: 0, y: 6 },
}: {
  children: ReactNode;
  className?: string;
  reduced: boolean;
  delay?: number;
  from?: FromTarget;
}): ReactNode {
  if (reduced) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      initial={from}
      whileInView={{
        opacity: 1,
        x: 0,
        y: 0,
        transition: { duration: 0.45, delay, ease: EASE },
      }}
      viewport={VIEWPORT}
    >
      {children}
    </motion.div>
  );
}

const AI_TARGETS = [
  { code: "de", value: "Bezahlen" },
  { code: "es", value: "Pagar" },
  { code: "fr", value: "Payer" },
] as const;
const FAN_STROKE = "color-mix(in srgb, var(--v-glow) 55%, transparent)";
const FAN_PATHS = [
  "M0 32 C 22 32, 22 12, 44 12",
  "M0 32 L 44 32",
  "M0 32 C 22 32, 22 52, 44 52",
] as const;

export function AiTranslationSkeleton(): ReactNode {
  const reduced = useReducedMotionPreference();
  return (
    <Panel className="flex flex-wrap items-center justify-center gap-2">
      <span className="rounded-md border border-fd-border px-2 py-1">
        <span className="text-[color:var(--text-faint)]">en</span>{" "}
        <span style={{ color: "var(--v-glow)" }}>&quot;Pay now&quot;</span>
      </span>
      <svg
        width="44"
        height="64"
        viewBox="0 0 44 64"
        fill="none"
        aria-hidden="true"
        className="shrink-0"
      >
        {FAN_PATHS.map((d, i) =>
          reduced ? (
            <path key={d} d={d} stroke={FAN_STROKE} strokeWidth="1.4" fill="none" />
          ) : (
            <motion.path
              key={d}
              d={d}
              stroke={FAN_STROKE}
              strokeWidth="1.4"
              fill="none"
              initial={{ pathLength: 0, opacity: 0 }}
              whileInView={{ pathLength: 1, opacity: 1 }}
              viewport={VIEWPORT}
              transition={{ duration: 0.5, delay: 0.1 + i * 0.08, ease: EASE }}
            />
          ),
        )}
      </svg>
      <div className="flex flex-col gap-1.5">
        {AI_TARGETS.map((target, i) => (
          <Reveal
            key={target.code}
            reduced={reduced}
            delay={0.35 + i * 0.12}
            from={{ opacity: 0, x: 8 }}
            className="rounded-md border border-fd-border px-2 py-1"
          >
            <span className="text-[color:var(--text-faint)]">{target.code}</span>{" "}
            <span className="text-fd-foreground">&quot;{target.value}&quot;</span>
          </Reveal>
        ))}
      </div>
    </Panel>
  );
}

const EXCEL_ROWS = [
  { key: "cart.pay", source: "Pay now", target: "Bezahlen" },
  { key: "cart.total", source: "Total", target: "Gesamt" },
  { key: "nav.home", source: "Home", target: "Start" },
] as const;
const EXCEL_HEADERS = ["key", "source", "target"] as const;

function GridGlyph(): ReactNode {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <rect x="1" y="1" width="10" height="10" rx="1" stroke="var(--v-glow)" strokeWidth="1" />
      <path d="M1 5h10M5 1v10" stroke="var(--v-glow)" strokeWidth="1" />
    </svg>
  );
}

export function ExcelHandoffSkeleton(): ReactNode {
  const reduced = useReducedMotionPreference();
  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="rounded border border-fd-border px-1.5 py-0.5 text-fd-muted-foreground">
          <span style={{ color: "var(--v-glow)" }}>$</span> export
        </span>
        <span className="text-[color:var(--text-faint)]">-&gt;</span>
        <span
          className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-fd-foreground"
          style={{
            borderColor: "color-mix(in srgb, var(--v-glow) 45%, var(--border-default))",
            background: "color-mix(in srgb, var(--v-glow) 10%, transparent)",
          }}
        >
          <GridGlyph /> .xlsx
        </span>
        <span className="text-[color:var(--text-faint)]">-&gt;</span>
        <span className="rounded border border-fd-border px-1.5 py-0.5 text-fd-muted-foreground">
          <span style={{ color: "var(--v-glow)" }}>$</span> import
        </span>
      </div>
      <div
        className="grid grid-cols-3 gap-px overflow-hidden rounded"
        style={{ background: "var(--border-default)" }}
      >
        {EXCEL_HEADERS.map((header) => (
          <div
            key={header}
            className="px-2 py-1 uppercase tracking-wide text-[color:var(--text-faint)]"
            style={{ background: "var(--surface-card)" }}
          >
            {header}
          </div>
        ))}
        {EXCEL_ROWS.map((row, i) => (
          <Fragment key={row.key}>
            <div
              className="px-2 py-1 text-fd-muted-foreground"
              style={{ background: "var(--surface-card)" }}
            >
              {row.key}
            </div>
            <div
              className="px-2 py-1 text-fd-muted-foreground"
              style={{ background: "var(--surface-card)" }}
            >
              {row.source}
            </div>
            <div className="px-2 py-1" style={{ background: "var(--surface-card)" }}>
              {reduced ? (
                <span className="block text-fd-foreground">{row.target}</span>
              ) : (
                <motion.span
                  className="block text-fd-foreground"
                  initial={{ opacity: 0 }}
                  whileInView={{ opacity: 1 }}
                  viewport={VIEWPORT}
                  transition={{ duration: 0.3, delay: 0.3 + i * 0.18, ease: EASE }}
                >
                  {row.target}
                </motion.span>
              )}
            </div>
          </Fragment>
        ))}
      </div>
    </Panel>
  );
}

const PIPELINE_NODES = ["commit", "check", "translate"] as const;

const CHECK_CIRCLE_CLASS = "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full";
const CHECK_CIRCLE_STYLE = {
  border: "1px solid color-mix(in srgb, var(--v-glow) 50%, var(--border-default))",
  background: "color-mix(in srgb, var(--v-glow) 12%, transparent)",
};
const CHECK_PATH = "M5 12.5 L10 17 L19 7";

function CheckMark({ reduced }: { reduced: boolean }): ReactNode {
  const shared = {
    d: CHECK_PATH,
    stroke: "var(--v-glow)",
    strokeWidth: "2.6",
    strokeLinecap: "round",
    strokeLinejoin: "round",
  } as const;
  if (reduced) return <path {...shared} />;
  return (
    <motion.path
      {...shared}
      initial={{ pathLength: 0 }}
      whileInView={{ pathLength: 1 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.4, delay: 0.75, ease: EASE }}
    />
  );
}

function CheckCircle({ reduced }: { reduced: boolean }): ReactNode {
  const mark = (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <CheckMark reduced={reduced} />
    </svg>
  );
  if (reduced) {
    return (
      <span className={CHECK_CIRCLE_CLASS} style={CHECK_CIRCLE_STYLE}>
        {mark}
      </span>
    );
  }
  return (
    <motion.span
      className={CHECK_CIRCLE_CLASS}
      style={CHECK_CIRCLE_STYLE}
      initial={{ opacity: 0, scale: 0.6 }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={VIEWPORT}
      transition={{ duration: 0.4, delay: 0.55, ease: EASE }}
    >
      {mark}
    </motion.span>
  );
}

export function AutomationSkeleton(): ReactNode {
  const reduced = useReducedMotionPreference();
  return (
    <Panel className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {PIPELINE_NODES.map((node, i) => (
          <Fragment key={node}>
            <Reveal
              reduced={reduced}
              delay={i * 0.18}
              from={{ opacity: 0, y: 4 }}
              className="rounded-md border border-[color:color-mix(in_srgb,var(--v-glow)_35%,var(--border-default))] px-2 py-1 text-fd-foreground"
            >
              {node}
            </Reveal>
            <span className="h-px w-3 shrink-0" style={{ background: "var(--border-default)" }} />
          </Fragment>
        ))}
        <CheckCircle reduced={reduced} />
      </div>
      <div className="text-[color:var(--text-faint)]">
        <span style={{ color: "var(--v-glow)" }}>exit 0</span> · --json · github action
      </div>
    </Panel>
  );
}
