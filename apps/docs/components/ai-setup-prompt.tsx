"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { CopyButton } from "@/components/ui/copy-button";
import { AI_SETUP_PROMPT } from "@/lib/ai-setup-prompt";
import { trackUmamiEvent } from "@/lib/umami";
import { breakUrlsAtSlashes } from "@/lib/word-breaks";

export function AiSetupPrompt({ label }: { label?: string } = {}): ReactNode {
  const t = useTranslations("landing.install");

  return (
    <figure
      className="m-0 grid border-t px-3.5 py-2"
      style={{ borderColor: "var(--border-default)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <figcaption className="vk-label flex min-h-6 items-center leading-snug">
          {label ?? t("aiLabel")}
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
        className="m-0 font-sans text-xs leading-(--leading-normal) text-pretty text-[color:var(--text-muted)]"
      >
        {breakUrlsAtSlashes(AI_SETUP_PROMPT)}
      </p>
    </figure>
  );
}
