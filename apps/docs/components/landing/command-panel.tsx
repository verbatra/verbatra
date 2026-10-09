"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { HighlightedCommand } from "@/components/ui/command-line";
import { CopyButton } from "@/components/ui/copy-button";
import { TabList, tabPanelProps } from "@/components/ui/tabs";
import { AI_SETUP_PROMPT } from "@/lib/ai-setup-prompt";
import { CLI_PACKAGE, NPM_INSTALL_COMMAND } from "@/lib/install-commands";
import { trackUmamiEvent } from "@/lib/umami";
import { breakUrlsAtSlashes, keepPackageRunsWhole } from "@/lib/word-breaks";
import { NPM_CLI } from "./links";

export const COMMAND_PANEL_ID = "hero-command";
export const COMMAND_PANEL_TABS = ["install", "prompt"] as const;
export type CommandPanelTab = (typeof COMMAND_PANEL_TABS)[number];

export type CommandPanelLabels = {
  tablist: string;
  install: string;
  prompt: string;
  installHint: string;
  promptHint: string;
};

function isTab(id: string): id is CommandPanelTab {
  return (COMMAND_PANEL_TABS as ReadonlyArray<string>).includes(id);
}

function PaneHead({ hint, children }: { hint: string; children: ReactNode }): ReactNode {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <p className="m-0 text-xs text-[color:var(--text-muted)]">{hint}</p>
      {children}
    </div>
  );
}

export function CommandPanel({ labels }: { labels: CommandPanelLabels }): ReactNode {
  const t = useTranslations("landing.install");
  const [active, setActive] = useState<CommandPanelTab>("install");

  function select(id: string) {
    if (!isTab(id) || id === active) return;
    setActive(id);
    trackUmamiEvent("hero-command-tab", { tab: id });
  }

  return (
    <div className="vk-command-panel not-prose @container">
      <div className="vk-command-panel-bar">
        <TabList
          tabs={COMMAND_PANEL_TABS.map((id) => ({ id, label: labels[id] }))}
          active={active}
          onSelect={select}
          ariaLabel={labels.tablist}
          variant="segmented"
          idPrefix={COMMAND_PANEL_ID}
        />
      </div>
      <div className="vk-command-panel-body">
        <div
          {...tabPanelProps(COMMAND_PANEL_ID, "install", active)}
          className="vk-command-panel-pane"
        >
          <PaneHead hint={labels.installHint}>
            <CopyButton
              text={NPM_INSTALL_COMMAND}
              label={t("copyAria")}
              size="sm"
              onCopied={() =>
                trackUmamiEvent("copy-install-command", { command: NPM_INSTALL_COMMAND })
              }
            />
          </PaneHead>
          <p className="vk-command-panel-command">
            <span aria-hidden="true" className="vk-command-panel-prompt-sign">
              ${" "}
            </span>
            <code>
              <HighlightedCommand
                command={NPM_INSTALL_COMMAND}
                link={{ token: CLI_PACKAGE, href: NPM_CLI }}
              />
            </code>
          </p>
        </div>
        <div
          {...tabPanelProps(COMMAND_PANEL_ID, "prompt", active)}
          className="vk-command-panel-pane"
        >
          <PaneHead hint={labels.promptHint}>
            <CopyButton
              text={AI_SETUP_PROMPT}
              label={t("copyPromptAria")}
              size="sm"
              onCopied={() => trackUmamiEvent("copy-ai-prompt")}
            />
          </PaneHead>
          <pre lang="en" className="vk-prompt-text">
            {breakUrlsAtSlashes(AI_SETUP_PROMPT, keepPackageRunsWhole)}
          </pre>
        </div>
      </div>
    </div>
  );
}
