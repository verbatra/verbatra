import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.ts";
import { Tooltip } from "./tooltip.tsx";

export interface FilterChipProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children" | "disabled"> {
  readonly pressed: boolean;
  readonly count: number;
  readonly unavailable?: string;
  readonly children: ReactNode;
}

const CHIP =
  "vk-field inline-flex items-center gap-1.5 rounded-(--radius-md) border border-(--border-default) bg-(--surface-card) px-2 py-1 text-xs font-medium text-(--text-muted) motion-safe:transition-colors motion-safe:duration-(--duration-fast) hover:border-(--accent) hover:text-(--text-strong) aria-pressed:border-(--accent) aria-pressed:bg-(--surface-hover) aria-pressed:text-(--text-strong) aria-disabled:cursor-default aria-disabled:opacity-60 aria-disabled:hover:border-(--border-default) aria-disabled:hover:text-(--text-muted)";

export function FilterChip({
  pressed,
  count,
  unavailable,
  className,
  onClick,
  children,
  ...props
}: FilterChipProps): ReactNode {
  const off = unavailable !== undefined && !pressed;
  const chip = (
    <button
      type="button"
      {...props}
      className={cn(CHIP, className)}
      aria-pressed={pressed}
      aria-disabled={off ? true : undefined}
      data-count={off ? undefined : count}
      onClick={off ? undefined : onClick}
    >
      {children}
      <span className="font-mono tabular-nums">{off ? "…" : count}</span>
    </button>
  );
  return unavailable !== undefined ? (
    <Tooltip label={unavailable} side="bottom">
      {chip}
    </Tooltip>
  ) : (
    chip
  );
}
