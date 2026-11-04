import { Card, Icon, type IconName, microLabelClassName, ProgressBar } from "@verbatra/ui";
import type { ReactNode } from "react";
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
  const valueClassName = cn(
    "mt-2 tabular-nums",
    quiet ? "text-base font-medium text-muted-foreground" : "font-mono text-2xl font-bold",
    quiet ? undefined : VALUE_TONE_CLASSNAME[tone],
  );
  return (
    <Card padding="sm" className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className={microLabelClassName}>{label}</span>
        {icon !== undefined ? (
          <span className="grid size-7 flex-none place-items-center rounded-sm bg-accent text-accent-foreground">
            <Icon name={icon} size={14} />
          </span>
        ) : null}
      </div>
      {typeof value === "string" ? (
        <div className={cn(valueClassName, "truncate")} title={value}>
          {value}
        </div>
      ) : (
        <div className={valueClassName}>{value}</div>
      )}
      {hint !== undefined ? (
        <p className="mt-1 text-xs text-muted-foreground">
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
