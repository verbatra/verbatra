import { Card, Icon, type IconName, microLabelClassName, ProgressBar } from "@verbatra/ui";
import { type ReactNode, useId } from "react";
import { cn } from "./lib/cn.js";

const VALUE_TONE_CLASSNAME = {
  default: "text-foreground",
  success: "text-success",
  danger: "text-danger",
} as const;

export function MetricCard({
  label,
  value,
  hint,
  hintHref,
  icon,
  quiet = false,
  tone = "default",
  progress,
  progressTone = "primary",
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: string;
  readonly hintHref?: string;
  readonly icon?: IconName;
  readonly quiet?: boolean;
  readonly tone?: "default" | "success" | "danger";
  readonly progress?: number;
  readonly progressTone?: "primary" | "danger";
}): ReactNode {
  const labelId = useId();
  const valueClassName = cn(
    "mt-2 min-w-0 wrap-anywhere tabular-nums",
    quiet ? "text-base font-medium text-muted-foreground" : "text-2xl font-bold",
    quiet ? undefined : VALUE_TONE_CLASSNAME[tone],
  );
  const isFigure = !quiet && typeof value === "string";
  return (
    <Card padding="sm" className="min-w-0" role="group" aria-labelledby={labelId}>
      <div className="flex items-center justify-between gap-2">
        <span id={labelId} className={cn(microLabelClassName, "min-w-0 wrap-anywhere")}>
          {label}
        </span>
        {icon !== undefined ? (
          <span className="grid size-7 flex-none place-items-center rounded-sm bg-accent text-accent-foreground">
            <Icon name={icon} size={14} />
          </span>
        ) : null}
      </div>
      <div className={valueClassName} data-metric-value="" data-figure={isFigure ? "" : undefined}>
        {value}
      </div>
      {hint !== undefined ? (
        <p className="mt-1 text-xs text-muted-foreground" data-metric-hint="">
          {hintHref !== undefined ? (
            <a
              href={hintHref}
              className="underline underline-offset-2 hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
            >
              {hint}
            </a>
          ) : (
            hint
          )}
        </p>
      ) : null}
      {progress !== undefined ? (
        <ProgressBar percent={progress} tone={progressTone} className="mt-3" />
      ) : null}
    </Card>
  );
}
