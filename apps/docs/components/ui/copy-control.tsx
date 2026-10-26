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
  compact?: boolean;
};

function CopyGlyph(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      width="14"
      height="14"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="hidden @max-[18rem]:block"
    >
      <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
      <path d="M10.5 5.5v-2a1.5 1.5 0 0 0-1.5-1.5h-5a1.5 1.5 0 0 0-1.5 1.5v5A1.5 1.5 0 0 0 4 10h1.5" />
    </svg>
  );
}

export function CopyControl({
  text,
  label,
  status: labels,
  size = "md",
  className,
  compact = false,
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
          compact && "@max-[18rem]:min-w-11 @max-[18rem]:px-0",
          className,
        )}
      >
        {compact ? (
          <>
            <CopyGlyph />
            <span className="@max-[18rem]:sr-only">{visible[status]}</span>
          </>
        ) : (
          visible[status]
        )}
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
