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
  | "danger";

const BASE =
  "not-prose inline-flex items-center font-mono uppercase rounded-[6px] border px-[7px] py-[3px] text-xs tracking-[0.08em] whitespace-nowrap";

const WRAPPED =
  "min-w-0 max-w-full whitespace-normal normal-case tracking-normal [overflow-wrap:anywhere]";

const TONE: Readonly<Record<BadgeTone, string>> = {
  neutral: "text-(--text-muted) border-(--border-default)",
  glow: "text-(--accent) border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]",
  new: "text-(--v-status-new) border-[color:color-mix(in_srgb,var(--accent)_40%,transparent)]",
  changed:
    "text-(--v-status-changed) border-[color:color-mix(in_srgb,var(--accent-fill)_40%,transparent)]",
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
  children,
}: {
  readonly tone?: BadgeTone;
  readonly wrap?: boolean;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <span className={cn(BASE, TONE[tone], wrap && WRAPPED)} data-tone={tone}>
      {children}
    </span>
  );
}
