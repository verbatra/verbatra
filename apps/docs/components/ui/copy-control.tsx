"use client";

import type { ReactNode } from "react";
import { CopyAnnouncement } from "@/components/ui/copy-announcement";
import { type CopyStatus, useCopyToClipboard } from "@/lib/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

const SIZE = {
  sm: "min-h-6 px-2 text-xs",
  md: "min-h-8 px-2.5 text-sm",
} as const;

const STATUS_CLASS: Record<CopyStatus, string> = {
  idle: "border-(--text-faint) text-(--text-muted) hover:bg-(--surface-hover) hover:text-(--text-strong)",
  copied: "border-(--accent) text-(--accent)",
  failed: "border-(--text-danger) text-(--text-danger)",
};

export type CopyControlStatusLabels = {
  readonly copy: string;
  readonly copied: string;
  readonly copyFailed: string;
};

export type CopyControlSize = keyof typeof SIZE;

type CopyControlProps = {
  text: string;
  label: string;
  status: CopyControlStatusLabels;
  size?: CopyControlSize;
  className?: string;
};

export function CopyControl({
  text,
  label,
  status: labels,
  size = "md",
  className,
}: CopyControlProps): ReactNode {
  const { status, attempts, copy } = useCopyToClipboard();
  const visible: Record<CopyStatus, string> = {
    idle: labels.copy,
    copied: labels.copied,
    failed: labels.copyFailed,
  };
  return (
    <>
      <button
        type="button"
        onClick={() => copy(text)}
        aria-label={status === "idle" ? label : undefined}
        data-status={status}
        className={cn(
          "vk-tap inline-flex shrink-0 items-center justify-center rounded-md border font-sans transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)",
          SIZE[size],
          STATUS_CLASS[status],
          className,
        )}
      >
        {visible[status]}
      </button>
      <CopyAnnouncement
        status={status}
        attempts={attempts}
        copied={labels.copied}
        failed={labels.copyFailed}
      />
    </>
  );
}
