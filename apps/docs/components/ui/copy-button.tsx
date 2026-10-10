"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { CopyAnnouncement } from "@/components/ui/copy-announcement";
import { trackUmamiEvent } from "@/lib/umami";
import { type CopyStatus, useCopyToClipboard } from "@/lib/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

const SIZE = {
  sm: "min-h-6 px-2 text-xs",
  md: "min-h-8 px-2.5 text-sm",
} as const;

const STATUS_CLASS: Record<CopyStatus, string> = {
  idle: "text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground",
  copied:
    "border-[color:color-mix(in_srgb,var(--v-glow)_45%,var(--border-default))] text-[color:var(--accent)]",
  failed: "border-[color:var(--border-danger)] text-[color:var(--text-danger)]",
};

const STATUS_LABEL = { idle: "copy", copied: "copied", failed: "copyFailed" } as const;

type CopyTracking =
  | { location: string; onCopied?: undefined }
  | { location?: string; onCopied: () => void };

export type CopyButtonProps = {
  text: string;
  label: string;
  size?: keyof typeof SIZE;
  className?: string;
} & CopyTracking;

function reportCopy(props: CopyButtonProps): void {
  if (props.onCopied) {
    props.onCopied();
    return;
  }
  trackUmamiEvent("copy-command", { command: props.text, location: props.location });
}

export function CopyButton(props: CopyButtonProps): ReactNode {
  const { text, label, size = "md", className } = props;
  const t = useTranslations("landing.install");
  const { status, attempts, copy } = useCopyToClipboard();
  return (
    <>
      <button
        type="button"
        onClick={async () => {
          if (await copy(text)) reportCopy(props);
        }}
        aria-label={status === "idle" ? label : undefined}
        data-status={status}
        className={cn(
          "inline-flex shrink-0 items-center rounded-md border border-fd-border font-sans transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--focus-ring)",
          SIZE[size],
          STATUS_CLASS[status],
          className,
        )}
      >
        {t(STATUS_LABEL[status])}
      </button>
      <CopyAnnouncement
        status={status}
        attempts={attempts}
        copied={t("copied")}
        failed={t("copyFailed")}
      />
    </>
  );
}
