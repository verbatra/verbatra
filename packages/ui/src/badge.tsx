import type { ReactNode } from "react";
import { cn } from "./cn.ts";

export type BadgeTone =
  | "neutral"
  | "glow"
  | "new"
  | "changed"
  | "unchanged"
  | "solid"
  | "success"
  | "warning"
  | "danger"
  | "missing"
  | "orphaned"
  | "protected";

const BASE =
  "not-prose relative inline-flex items-center font-mono font-normal uppercase rounded-(--radius-sm) border px-[7px] py-[3px] text-xs tracking-[0.08em] whitespace-nowrap";

const WRAPPED = "min-w-0 max-w-full whitespace-normal [overflow-wrap:anywhere]";

const VERBATIM = "normal-case tracking-normal";

const TONE: Readonly<Record<BadgeTone, string>> = {
  neutral: "text-(--text-muted) border-(--border-default)",
  glow: "text-(--accent) border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]",
  new: "text-(--v-status-new) border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]",
  changed:
    "text-(--diff-changed) bg-(--diff-changed-soft) border-[color:color-mix(in_srgb,var(--diff-changed)_40%,transparent)]",
  missing:
    "text-(--diff-missing) bg-(--diff-missing-soft) border-[color:color-mix(in_srgb,var(--diff-missing)_40%,transparent)]",
  orphaned:
    "text-(--diff-orphaned) bg-(--diff-orphaned-soft) border-[color:color-mix(in_srgb,var(--diff-orphaned)_40%,transparent)]",
  protected:
    "text-(--diff-protected) bg-(--diff-protected-soft) border-[color:color-mix(in_srgb,var(--diff-protected)_40%,transparent)]",
  unchanged: "text-(--v-status-unchanged) border-(--border-default)",
  solid: "text-(--accent-fill-fg) border-transparent bg-(--accent-fill)",
  success:
    "text-(--status-success) bg-(--status-success-soft) border-[color:color-mix(in_srgb,var(--status-success)_40%,transparent)]",
  warning:
    "text-(--status-warning) bg-(--status-warning-soft) border-[color:color-mix(in_srgb,var(--status-warning)_40%,transparent)]",
  danger:
    "text-(--status-danger) bg-(--status-danger-soft) border-[color:color-mix(in_srgb,var(--status-danger)_40%,transparent)]",
};

export function Badge({
  tone = "neutral",
  wrap = false,
  verbatim = false,
  children,
}: {
  readonly tone?: BadgeTone;
  readonly wrap?: boolean;
  readonly verbatim?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <span className={cn(BASE, TONE[tone], wrap && WRAPPED, verbatim && VERBATIM)} data-tone={tone}>
      {children}
    </span>
  );
}
