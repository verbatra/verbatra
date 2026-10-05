"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { AI_SETUP_PROMPT } from "@/lib/ai-setup-prompt";
import { trackUmamiEvent } from "@/lib/umami";
import { cn } from "@/lib/utils";
import { breakUrlsAtSlashes } from "@/lib/word-breaks";

const VARIANT = {
  row: "border-t",
  panel: "not-prose my-6 max-w-(--width-measure) rounded-xl border",
} as const;

const PROMPT_TEXT = {
  row: "text-xs text-[color:var(--text-muted)]",
  panel: "text-sm text-[color:var(--text-body)]",
} as const;

export function AiSetupPrompt({
  variant = "panel",
}: {
  variant?: keyof typeof VARIANT;
}): ReactNode {
  const t = useTranslations("landing.install");

  return (
    <figure
      className={cn("m-0 grid px-3.5 py-2", VARIANT[variant])}
      style={{
        borderColor: "var(--border-default)",
        ...(variant === "panel" ? { background: "var(--v-void)" } : {}),
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <figcaption className="vk-label flex min-h-6 min-w-0 items-center text-balance leading-snug">
          {t("aiLabel")}
        </figcaption>
        <CopyButton
          text={AI_SETUP_PROMPT}
          label={t("copyPromptAria")}
          size="sm"
          onCopied={() => trackUmamiEvent("copy-ai-prompt")}
        />
      </div>
      <p
        lang="en"
        className={cn("m-0 font-sans leading-(--leading-normal) text-pretty", PROMPT_TEXT[variant])}
      >
        {breakUrlsAtSlashes(AI_SETUP_PROMPT)}
      </p>
    </figure>
  );
}
