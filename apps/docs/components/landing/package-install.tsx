"use client";

import { AnimatePresence, motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { HighlightedCommand } from "@/components/ui/command-line";
import { CopyButton } from "@/components/ui/copy-button";
import { TabList, tabId, tabPanelId } from "@/components/ui/tabs";
import { AI_SETUP_PROMPT } from "@/lib/ai-setup-prompt";
import { type Locale, localizedPath } from "@/lib/i18n";
import { CLI_PACKAGE, INSTALL_COMMANDS, type PackageManagerId } from "@/lib/install-commands";
import { usePackageManager } from "@/lib/package-manager-preference";
import { useReducedMotionPreference } from "@/lib/reduced-motion";
import { trackUmamiEvent } from "@/lib/umami";
import { cn } from "@/lib/utils";
import { NPM_CLI } from "./links";

const INSTALL_ID = "hero-install";
const AI_PANEL_ID = `${INSTALL_ID}-ai-prompt`;
const TAB_CLASS = "rounded-md px-2.5 py-1.5 font-mono text-xs transition-colors";
const EASE_OUT = [0.22, 1, 0.36, 1] as const;
const ROW_CLASS = "flex items-center gap-3 px-3.5 py-3 font-mono text-sm";
const CODE_CLASS = "vk-terminal-scroll min-w-0 flex-1 whitespace-nowrap text-fd-foreground";

const HINT_LINK_CLASS =
  "inline-flex min-h-6 items-center underline decoration-fd-border underline-offset-4 transition-colors hover:text-[var(--accent)] hover:decoration-[var(--accent)]";

function Hint({
  activeKey,
  hint,
  reduced,
}: {
  activeKey: string;
  hint: ReactNode | null;
  reduced: boolean;
}): ReactNode {
  return (
    <div aria-live="polite">
      <AnimatePresence mode="wait">
        {hint ? (
          <motion.p
            key={activeKey}
            className="mt-3 text-sm leading-relaxed text-fd-muted-foreground"
            initial={reduced ? false : { opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, y: -4 }}
            transition={reduced ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }}
          >
            {hint}
          </motion.p>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function AiSwitch({
  checked,
  label,
  onToggle,
}: {
  checked: boolean;
  label: string;
  onToggle: () => void;
}): ReactNode {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-controls={AI_PANEL_ID}
      onClick={onToggle}
      className={cn(
        "ms-auto inline-flex min-h-8 items-center gap-2 whitespace-nowrap rounded-md px-2 font-mono text-xs transition-colors",
        checked ? "text-fd-foreground" : "text-fd-muted-foreground hover:text-fd-foreground",
      )}
    >
      {label}
      <span
        aria-hidden="true"
        className="relative inline-flex h-4 w-7 shrink-0 items-center rounded-full border transition-colors"
        style={{
          borderColor: checked ? "var(--accent)" : "var(--border-default)",
          background: checked
            ? "color-mix(in srgb, var(--v-purple) 45%, transparent)"
            : "var(--surface-bg)",
        }}
      >
        <span
          className={cn(
            "absolute size-2.5 rounded-full transition-transform motion-reduce:transition-none",
            checked ? "translate-x-[14px]" : "translate-x-[2px]",
          )}
          style={{ background: checked ? "var(--accent)" : "var(--text-faint)" }}
        />
      </span>
    </button>
  );
}

export function PackageInstall(): ReactNode {
  const t = useTranslations("landing.install");
  const locale = useLocale() as Locale;
  const [manager, selectManager] = usePackageManager("npm");
  const [ai, setAi] = useState(false);
  const reduced = useReducedMotionPreference();

  const hint: ReactNode | null = ai ? (
    <>
      {t("aiCaption")}{" "}
      <a href={localizedPath(locale, "/docs/start-with-ai")} className={HINT_LINK_CLASS}>
        {t("aiCaptionLink")}
      </a>
    </>
  ) : manager === "pnpm" ? (
    <>
      {t("pnpmNote")}{" "}
      <a href={localizedPath(locale, "/docs/troubleshooting")} className={HINT_LINK_CLASS}>
        {t("pnpmNoteLink")}
      </a>
    </>
  ) : null;

  return (
    <div className="vk-w-install not-prose w-full">
      <div
        className="overflow-hidden rounded-xl border border-fd-border backdrop-blur-[6px]"
        style={{ background: "color-mix(in srgb, var(--v-void) 72%, transparent)" }}
      >
        <div className="flex min-h-11 items-center gap-1 border-b border-fd-border px-2 py-1.5">
          {ai ? null : (
            <TabList
              tabs={INSTALL_COMMANDS}
              active={manager}
              onSelect={(id) => selectManager(id as PackageManagerId)}
              ariaLabel={t("tablistLabel")}
              className="flex gap-1"
              tabClassName={TAB_CLASS}
              variant="pill"
              idPrefix={INSTALL_ID}
            />
          )}
          <AiSwitch checked={ai} label={t("aiSwitch")} onToggle={() => setAi((on) => !on)} />
        </div>
        {INSTALL_COMMANDS.map((entry) => (
          <div
            key={entry.id}
            id={tabPanelId(INSTALL_ID, entry.id)}
            role="tabpanel"
            aria-labelledby={tabId(INSTALL_ID, entry.id)}
            hidden={ai || entry.id !== manager}
            className={ROW_CLASS}
          >
            <span aria-hidden="true" style={{ color: "var(--v-glow)" }}>
              $
            </span>
            <code className={CODE_CLASS}>
              <HighlightedCommand
                command={entry.command}
                link={{ token: CLI_PACKAGE, href: NPM_CLI }}
              />
            </code>
            <CopyButton
              text={entry.command}
              label={t("copyAria")}
              onCopied={() => trackUmamiEvent("copy-install-command", { manager: entry.id })}
            />
          </div>
        ))}
        <div id={AI_PANEL_ID} hidden={!ai} className={ROW_CLASS}>
          <code className={CODE_CLASS}>{AI_SETUP_PROMPT}</code>
          <CopyButton
            text={AI_SETUP_PROMPT}
            label={t("copyPromptAria")}
            onCopied={() => trackUmamiEvent("copy-ai-prompt")}
          />
        </div>
      </div>
      <Hint activeKey={ai ? "ai" : manager} hint={hint} reduced={reduced} />
    </div>
  );
}
