"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AgentCommandRow } from "@/components/agent-command-row";
import { AiSetupPrompt } from "@/components/ai-setup-prompt";
import { HighlightedCommand } from "@/components/ui/command-line";
import { CopyButton } from "@/components/ui/copy-button";
import { CLI_PACKAGE, NPM_INSTALL_COMMAND } from "@/lib/install-commands";
import { trackUmamiEvent } from "@/lib/umami";
import { NPM_CLI } from "./links";

export function PackageInstall(): ReactNode {
  const t = useTranslations("landing.install");

  return (
    <div className="vk-w-install not-prose @container w-full">
      <div
        className="overflow-hidden rounded-xl border backdrop-blur-[6px]"
        style={{
          background: "color-mix(in srgb, var(--v-void) 72%, transparent)",
          borderColor: "var(--border-default)",
        }}
      >
        <div className="flex items-start gap-3 px-3.5 py-3 font-mono text-sm leading-6">
          <span aria-hidden="true" className="pt-1" style={{ color: "var(--v-glow)" }}>
            $
          </span>
          <code className="vk-terminal-scroll min-w-0 flex-1 whitespace-nowrap pt-1 text-[color:var(--text-strong)] @max-[30rem]:whitespace-normal">
            <HighlightedCommand
              command={NPM_INSTALL_COMMAND}
              link={{ token: CLI_PACKAGE, href: NPM_CLI }}
            />
          </code>
          <CopyButton
            text={NPM_INSTALL_COMMAND}
            label={t("copyAria")}
            onCopied={() =>
              trackUmamiEvent("copy-install-command", { command: NPM_INSTALL_COMMAND })
            }
          />
        </div>
        <AgentCommandRow />
        <AiSetupPrompt />
      </div>
    </div>
  );
}
