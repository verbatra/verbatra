"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AiSetupPrompt } from "@/components/ai-setup-prompt";
import { CommandRow } from "@/components/command-row";
import { AGENT_INIT_COMMAND, CLI_PACKAGE, NPM_INSTALL_COMMAND } from "@/lib/install-commands";
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
        <CommandRow
          command={NPM_INSTALL_COMMAND}
          link={{ token: CLI_PACKAGE, href: NPM_CLI }}
          label={t("copyAria")}
          event="copy-install-command"
          wrapsWhenNarrow
        />
        <CommandRow
          command={AGENT_INIT_COMMAND}
          label={t("copyAgentAria")}
          event="copy-agent-command"
          divided
        />
        <AiSetupPrompt />
      </div>
    </div>
  );
}
