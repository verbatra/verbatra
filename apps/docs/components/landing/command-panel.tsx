"use client";

import { useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { HighlightedCommand } from "@/components/ui/command-line";
import { CopyButton } from "@/components/ui/copy-button";
import { TabList, tabPanelProps } from "@/components/ui/tabs";
import { AI_SETUP_PROMPT } from "@/lib/ai-setup-prompt";
import { NPM_INSTALL_COMMAND } from "@/lib/install-commands";
import { breakUrlsAtSlashes, keepPackageRunsWhole } from "@/lib/word-breaks";

const COMMAND_PANEL_ID = "hero-command";
const COMMAND_PANEL_TABS = ["install", "prompt"] as const;
type CommandPanelTab = (typeof COMMAND_PANEL_TABS)[number];

type CommandPanelLabels = {
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
      <p className="m-0 text-xs text-(--text-muted)">{hint}</p>
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
            <CopyButton text={NPM_INSTALL_COMMAND} label={t("copyAria")} size="sm" />
          </PaneHead>
          <p className="vk-command-panel-command">
            <span aria-hidden="true" className="vk-command-panel-prompt-sign">
              ${" "}
            </span>
            <code>
              <HighlightedCommand command={NPM_INSTALL_COMMAND} />
            </code>
          </p>
        </div>
        <div
          {...tabPanelProps(COMMAND_PANEL_ID, "prompt", active)}
          className="vk-command-panel-pane"
        >
          <PaneHead hint={labels.promptHint}>
            <CopyButton text={AI_SETUP_PROMPT} label={t("copyPromptAria")} size="sm" />
          </PaneHead>
          <pre lang="en" className="vk-prompt-text">
            {breakUrlsAtSlashes(AI_SETUP_PROMPT, keepPackageRunsWhole)}
          </pre>
        </div>
      </div>
    </div>
  );
}
