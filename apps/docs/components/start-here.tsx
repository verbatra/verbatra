import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AgentCommandRow } from "@/components/agent-command-row";
import { AiSetupPrompt } from "@/components/ai-setup-prompt";
import { withInlineCode } from "@/lib/inline-code-text";

export function StartHere(): ReactNode {
  const t = useTranslations("docs.startHere");

  return (
    <aside
      aria-label={t("title")}
      className="not-prose @container my-6 max-w-(--width-measure) overflow-hidden rounded-xl border"
      style={{
        background: "var(--v-void)",
        borderColor: "var(--border-default)",
        borderInlineStart: "3px solid var(--v-purple)",
      }}
    >
      <div className="grid gap-1 px-3.5 pt-3 pb-2.5">
        <p className="vk-label m-0">{t("title")}</p>
        <p className="m-0 text-sm leading-(--leading-normal) text-pretty text-[color:var(--text-body)]">
          {withInlineCode(t("lead"))}
        </p>
      </div>
      <AgentCommandRow />
      <AiSetupPrompt />
    </aside>
  );
}
