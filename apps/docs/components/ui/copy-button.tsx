"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { trackUmamiEvent } from "@/lib/umami";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";
import { cn } from "@/lib/utils";

const SIZE = {
  sm: "min-h-6 px-2 text-xs",
  md: "min-h-8 px-2.5 text-sm",
} as const;

export function CopyButton({
  text,
  label,
  size = "md",
  className,
  onCopied,
}: {
  text: string;
  label: string;
  size?: keyof typeof SIZE;
  className?: string;
  onCopied?: () => void;
}): ReactNode {
  const t = useTranslations("landing.install");
  const [copied, copy] = useCopyToClipboard();
  return (
    <button
      type="button"
      onClick={() => {
        copy(text);
        if (onCopied) {
          onCopied();
        } else {
          trackUmamiEvent("copy-command", { command: text });
        }
      }}
      aria-label={label}
      className={cn(
        "inline-flex shrink-0 items-center rounded-md border border-fd-border font-sans transition-colors",
        SIZE[size],
        copied
          ? "border-[color:color-mix(in_srgb,var(--v-glow)_45%,var(--border-default))] text-[color:var(--accent)]"
          : "text-fd-muted-foreground hover:bg-fd-accent hover:text-fd-accent-foreground",
        className,
      )}
    >
      {copied ? t("copied") : t("copy")}
    </button>
  );
}
