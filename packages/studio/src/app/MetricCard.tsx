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
  icon,
  tone = "default",
  progress,
  progressTone = "primary",
}: {
  readonly label: string;
  readonly value: ReactNode;
  readonly hint?: string;
  readonly icon?: IconName;
  readonly tone?: "default" | "success" | "danger";
  readonly progress?: number;
  readonly progressTone?: "primary" | "danger";
}): ReactNode {
  const valueClassName = cn(
    "mt-2 font-mono text-2xl font-bold tabular-nums",
    VALUE_TONE_CLASSNAME[tone],
  );
  return (
    <Card padding="sm" className="min-w-0">
      <div className="flex items-center justify-between gap-2">
        <span className={microLabelClassName}>{label}</span>
        {icon !== undefined ? (
          <span className="grid size-7 flex-none place-items-center rounded-md bg-accent text-accent-foreground">
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
      {hint !== undefined ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      {progress !== undefined ? (
        <ProgressBar percent={progress} tone={progressTone} className="mt-3" />
      ) : null}
    </Card>
  );
}
