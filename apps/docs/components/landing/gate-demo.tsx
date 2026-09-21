import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import {
  GATE_CLI_COMMAND,
  GATE_CLI_LINE,
  GATE_REFUSAL,
  GATE_SOURCE_FILE,
  GATE_SOURCE_LINES,
  GATE_TARGET_FILE,
  GATE_TARGET_LINES,
  type GateLine,
} from "@/lib/gate-demo";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const MONO = "font-mono text-[13px] leading-6";

function Panel({
  file,
  badge,
  tone,
  note,
  children,
}: {
  file: string;
  badge: string;
  tone: "neutral" | "accent" | "danger";
  note: string;
  children: ReactNode;
}): ReactNode {
  const badgeColor =
    tone === "danger"
      ? "var(--text-danger)"
      : tone === "accent"
        ? "var(--accent)"
        : "var(--text-faint)";
  const badgeBorder =
    tone === "danger"
      ? "var(--border-danger)"
      : tone === "accent"
        ? "color-mix(in srgb, var(--v-glow) 45%, transparent)"
        : "var(--border-default)";
  return (
    <div
      className="flex flex-col overflow-hidden rounded-xl border border-fd-border"
      style={{ background: "var(--surface-card)" }}
    >
      <div className="flex items-center justify-between gap-3 border-b border-fd-border px-4 py-3">
        <span className={`${MONO} text-fd-foreground`}>{file}</span>
        <span
          className="rounded-full border px-2 py-0.5 text-[13px] font-medium"
          style={{ color: badgeColor, borderColor: badgeBorder }}
        >
          {badge}
        </span>
      </div>
      <div className="flex-1 px-4 py-4">{children}</div>
      <p className="border-t border-fd-border px-4 py-3 text-[13px] leading-relaxed text-fd-muted-foreground">
        {note}
      </p>
    </div>
  );
}

function CodeLines({
  lines,
  labels,
}: {
  lines: ReadonlyArray<GateLine>;
  labels: Readonly<Record<string, string>>;
}): ReactNode {
  return (
    <div className={MONO}>
      {lines.map((line) => (
        <div key={line.text} className="flex items-start gap-3">
          <code className="min-w-0 flex-1 whitespace-pre-wrap break-words text-fd-muted-foreground">
            {line.text}
          </code>
          {line.annotation ? (
            <span
              className="shrink-0 text-[13px]"
              style={{
                color: line.annotation === "new" ? "var(--accent)" : "var(--text-faint)",
                fontFamily: "var(--font-display)",
              }}
            >
              {labels[line.annotation]}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function RefusalRow({ label, value }: { label: string; value: string }): ReactNode {
  return (
    <div className="grid grid-cols-[84px_1fr] gap-3">
      <dt className="text-[13px] text-[color:var(--text-faint)]">{label}</dt>
      <dd className={`${MONO} min-w-0 whitespace-pre-wrap break-words text-fd-foreground`}>
        {value}
      </dd>
    </div>
  );
}

export async function GateDemo(): Promise<ReactNode> {
  const t = await getTranslations("landing.gate");
  const annotations = { new: t("annotations.new"), kept: t("annotations.kept") };

  return (
    <Section width="wide" rhythm="lg" id="integrity-gate">
      <SectionHead title={t("heading")} lead={t("lead")} maxWidth="720px" />
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        <Panel
          file={GATE_SOURCE_FILE}
          badge={t("panels.source.badge")}
          tone="neutral"
          note={t("panels.source.note")}
        >
          <CodeLines lines={GATE_SOURCE_LINES} labels={annotations} />
        </Panel>

        <Panel
          file={GATE_TARGET_FILE}
          badge={t("panels.written.badge")}
          tone="accent"
          note={t("panels.written.note")}
        >
          <CodeLines lines={GATE_TARGET_LINES} labels={annotations} />
        </Panel>

        <Panel
          file={GATE_TARGET_FILE}
          badge={t("panels.refused.badge")}
          tone="danger"
          note={t("panels.refused.note")}
        >
          <dl className="grid gap-1.5">
            <RefusalRow label={t("rows.key")} value={GATE_REFUSAL.key} />
            <RefusalRow label={t("rows.candidate")} value={GATE_REFUSAL.candidate} />
            <RefusalRow label={t("rows.missing")} value={GATE_REFUSAL.missing} />
            <RefusalRow label={t("rows.reason")} value={GATE_REFUSAL.reason} />
            <RefusalRow label={t("rows.kept")} value={GATE_REFUSAL.kept} />
          </dl>
          <p className="mt-4 text-[13px] leading-relaxed text-fd-muted-foreground">
            {t("reasonGloss")}
          </p>
        </Panel>
      </div>

      <div
        className="mt-4 overflow-hidden rounded-xl border border-fd-border"
        style={{ background: "var(--surface-card)" }}
      >
        <p className="border-b border-fd-border px-4 py-3 text-[13px] text-fd-muted-foreground">
          {t("outputLabel")}
        </p>
        <pre className={`${MONO} whitespace-pre-wrap break-words px-4 py-4 text-fd-foreground`}>
          <code>{`$ ${GATE_CLI_COMMAND}\n${GATE_CLI_LINE}`}</code>
        </pre>
      </div>
    </Section>
  );
}
