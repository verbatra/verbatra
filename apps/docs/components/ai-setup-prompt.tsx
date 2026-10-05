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
  panel: "not-prose my-6 rounded-xl border",
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
        <figcaption className="vk-label min-w-0 text-balance leading-6">{t("aiLabel")}</figcaption>
        <CopyButton
          text={AI_SETUP_PROMPT}
          label={t("copyPromptAria")}
          size="sm"
          onCopied={() => trackUmamiEvent("copy-ai-prompt")}
        />
      </div>
      <p
        lang="en"
        className="m-0 font-sans text-xs leading-(--leading-normal) text-[color:var(--text-muted)]"
      >
        {breakUrlsAtSlashes(AI_SETUP_PROMPT)}
      </p>
    </figure>
  );
}
