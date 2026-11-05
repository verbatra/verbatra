import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "./cn.ts";

export type KbdTone = "muted" | "strong";

const KBD =
  "inline-flex min-w-5 items-center justify-center rounded-(--radius-sm) border border-(--border-default) bg-(--surface-muted) px-1.5 py-0.5 font-mono text-xs";

const TONES: Readonly<Record<KbdTone, string>> = {
  muted: "text-(--text-muted)",
  strong: "text-(--text-strong)",
};

export function Kbd({
  tone = "muted",
  className,
  ...props
}: HTMLAttributes<HTMLElement> & { readonly tone?: KbdTone }): ReactNode {
  return <kbd data-tone={tone} className={cn(KBD, TONES[tone], className)} {...props} />;
}
