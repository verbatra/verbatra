"use client";

import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { HighlightedCommand } from "@/components/ui/command-line";
import { CopyButton } from "@/components/ui/copy-button";
import { AI_SETUP_PROMPT } from "@/lib/ai-setup-prompt";
import { CLI_PACKAGE, NPM_INSTALL_COMMAND } from "@/lib/install-commands";
import { trackUmamiEvent } from "@/lib/umami";
import { NPM_CLI } from "./links";

export function PackageInstall(): ReactNode {
  const t = useTranslations("landing.install");

  return (
    <div className="vk-w-install not-prose @container w-full">
      <div
        className="overflow-hidden rounded-xl border border-fd-border backdrop-blur-[6px]"
        style={{ background: "color-mix(in srgb, var(--v-void) 72%, transparent)" }}
      >
        <div className="flex items-center gap-3 px-3.5 py-3 font-mono text-sm">
          <span aria-hidden="true" style={{ color: "var(--v-glow)" }}>
            $
          </span>
          <code className="vk-terminal-scroll min-w-0 flex-1 whitespace-nowrap text-fd-foreground @max-[30rem]:whitespace-normal">
            <HighlightedCommand
              command={NPM_INSTALL_COMMAND}
              link={{ token: CLI_PACKAGE, href: NPM_CLI }}
            />
          </code>
          <CopyButton
            text={NPM_INSTALL_COMMAND}
            label={t("copyAria")}
            onCopied={() => trackUmamiEvent("copy-install-command")}
          />
        </div>
        <figure className="m-0 grid gap-2 border-t border-fd-border px-3.5 py-3">
          <figcaption className="vk-label">{t("aiLabel")}</figcaption>
          <div className="flex items-start gap-3">
            <p className="m-0 min-w-0 flex-1 text-sm leading-relaxed text-fd-muted-foreground">
              {AI_SETUP_PROMPT}
            </p>
            <CopyButton
              text={AI_SETUP_PROMPT}
              label={t("copyPromptAria")}
              onCopied={() => trackUmamiEvent("copy-ai-prompt")}
            />
          </div>
        </figure>
      </div>
    </div>
  );
}
