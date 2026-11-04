import type { ReactNode } from "react";
import { cn } from "./cn.ts";

export type ProgressTone = "primary" | "danger";

const TONE: Readonly<Record<ProgressTone, string>> = {
  primary: "bg-(--accent-fill)",
  danger: "bg-(--status-danger)",
};

export function ProgressBar({
  percent,
  tone = "primary",
  ariaLabel,
  className,
}: {
  readonly percent: number;
  readonly tone?: ProgressTone;
  readonly ariaLabel?: string;
  readonly className?: string;
}): ReactNode {
  const clamped = Math.min(100, Math.max(0, percent));
  return (
    <span
      className={cn(
        "block h-1.5 w-full overflow-hidden rounded-(--radius-full) bg-(--status-neutral-soft)",
        className,
      )}
      {...(ariaLabel === undefined
        ? { "aria-hidden": true }
        : {
            role: "progressbar",
            "aria-label": ariaLabel,
            "aria-valuemin": 0,
            "aria-valuemax": 100,
            "aria-valuenow": clamped,
          })}
    >
      <span
        data-tone={tone}
        className={cn(
          "block h-full rounded-[inherit] motion-safe:transition-[width] motion-safe:duration-(--duration-base)",
          TONE[tone],
        )}
        style={{ width: `${clamped}%` }}
      />
    </span>
  );
}
