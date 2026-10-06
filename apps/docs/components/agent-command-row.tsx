"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { HighlightedCommand } from "@/components/ui/command-line";
import { CopyButton } from "@/components/ui/copy-button";
import { AGENT_INIT_COMMAND } from "@/lib/install-commands";
import { trackUmamiEvent } from "@/lib/umami";

export function AgentCommandRow(): ReactNode {
  const t = useTranslations("landing.install");

  return (
    <div
      className="flex items-start gap-3 border-t px-3.5 py-3 font-mono text-sm leading-6"
      style={{ borderColor: "var(--border-default)" }}
    >
      <span aria-hidden="true" className="pt-1" style={{ color: "var(--v-glow)" }}>
        $
      </span>
      <code className="vk-terminal-scroll min-w-0 flex-1 whitespace-nowrap pt-1 text-[color:var(--text-strong)] @max-[30rem]:whitespace-normal">
        <HighlightedCommand command={AGENT_INIT_COMMAND} />
      </code>
      <CopyButton
        text={AGENT_INIT_COMMAND}
        label={t("copyAgentAria")}
        onCopied={() => trackUmamiEvent("copy-agent-command", { command: AGENT_INIT_COMMAND })}
      />
    </div>
  );
}
