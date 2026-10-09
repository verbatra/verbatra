import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AiSetupPrompt } from "@/components/ai-setup-prompt";
import { CommandRow } from "@/components/command-row";
import { withInlineCode } from "@/lib/inline-code-text";
import { AGENT_INIT_COMMAND } from "@/lib/install-commands";

export function StartHere(): ReactNode {
  const t = useTranslations("docs.startHere");
  const install = useTranslations("landing.install");

  return (
    <aside
      aria-label={t("title")}
      className="not-prose @container my-6 max-w-(--width-measure) overflow-hidden rounded-xl border"
      style={{ background: "var(--v-void)", borderColor: "var(--border-default)" }}
    >
      <div className="grid gap-1 px-3.5 pt-3 pb-2.5">
        <p className="vk-label m-0">{t("title")}</p>
        <p className="m-0 text-sm leading-(--leading-normal) text-pretty text-[color:var(--text-body)]">
          {withInlineCode(t("lead"))}
        </p>
      </div>
      <CommandRow
        command={AGENT_INIT_COMMAND}
        label={install("copyAgentAria")}
        location="start-here"
        divided
      />
      <AiSetupPrompt location="start-here" />
    </aside>
  );
}
