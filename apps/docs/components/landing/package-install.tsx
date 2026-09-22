"use client";

import { AnimatePresence, motion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { HighlightedCommand } from "@/components/ui/command-line";
import { CopyButton } from "@/components/ui/copy-button";
import { TabList } from "@/components/ui/tabs";
import { AI_SETUP_PROMPT } from "@/lib/ai-setup-prompt";
import { type Locale, localizedPath } from "@/lib/i18n";
import { useReducedMotionPreference } from "@/lib/reduced-motion";
import { trackUmamiEvent } from "@/lib/umami";
import { cn } from "@/lib/utils";
import { NPM_CLI } from "./links";

const MANAGERS = [
  { id: "npm", label: "npm", command: "npm i -D @verbatra/cli" },
  { id: "pnpm", label: "pnpm", command: "pnpm add -D @verbatra/cli" },
  { id: "yarn", label: "yarn", command: "yarn add -D @verbatra/cli" },
  { id: "bun", label: "bun", command: "bun add -d @verbatra/cli" },
] as const;

const AI_TAB_ID = "ai" as const;
type ManagerId = (typeof MANAGERS)[number]["id"];
type ActiveTab = ManagerId | typeof AI_TAB_ID;

const CLI_TOKEN = "@verbatra/cli";
const TAB_CLASS = "rounded-md px-2.5 py-1.5 font-mono text-xs transition-colors";
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

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
            className="mt-3 text-[13px] leading-relaxed text-fd-muted-foreground"
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

export function PackageInstall(): ReactNode {
  const t = useTranslations("landing.install");
  const locale = useLocale() as Locale;
  const [active, setActive] = useState<ActiveTab>("npm");
  const reduced = useReducedMotionPreference();
  const isAiTab = active === AI_TAB_ID;
  const manager = MANAGERS.find((m) => m.id === active) ?? MANAGERS[0];
  const commandText = isAiTab ? AI_SETUP_PROMPT : manager.command;

  const hint: ReactNode | null =
    active === "pnpm" ? (
      <>
        {t("pnpmNote")}{" "}
        <a href={localizedPath(locale, "/docs/troubleshooting")} className={HINT_LINK_CLASS}>
          {t("pnpmNoteLink")}
        </a>
      </>
    ) : isAiTab ? (
      <>
        {t("aiCaption")}{" "}
        <a href={localizedPath(locale, "/docs/start-with-ai")} className={HINT_LINK_CLASS}>
          {t("aiCaptionLink")}
        </a>
      </>
    ) : null;

  const trackCopy = () => {
    if (isAiTab) {
      trackUmamiEvent("copy-ai-prompt");
    } else {
      trackUmamiEvent("copy-install-command", { manager: active });
    }
  };

  return (
    <div className="vk-w-install not-prose w-full">
      <div
        className="overflow-hidden rounded-xl border border-fd-border backdrop-blur-[6px]"
        style={{ background: "color-mix(in srgb, var(--v-void) 72%, transparent)" }}
      >
        <div className="flex items-center gap-1 border-b border-fd-border px-2 py-1.5">
          <TabList
            tabs={MANAGERS}
            active={active}
            onSelect={(id) => setActive(id as ManagerId)}
            ariaLabel={t("tablistLabel")}
            className="flex gap-1"
            tabClassName={TAB_CLASS}
            variant="pill"
          />
          <button
            type="button"
            aria-pressed={isAiTab}
            onClick={() => setActive(AI_TAB_ID)}
            className={cn(
              TAB_CLASS,
              "ml-auto",
              isAiTab
                ? "bg-[color:var(--surface-card)] text-fd-foreground"
                : "text-fd-muted-foreground hover:text-fd-foreground",
            )}
          >
            {t("aiTabLabel")}
          </button>
        </div>
        <div className="flex items-center gap-3 px-3.5 py-3 font-mono text-sm">
          {isAiTab ? null : (
            <span aria-hidden="true" style={{ color: "var(--v-glow)" }}>
              $
            </span>
          )}
          <code className="vk-scroll min-w-0 flex-1 overflow-x-auto whitespace-nowrap text-fd-foreground">
            {isAiTab ? (
              commandText
            ) : (
              <HighlightedCommand
                command={commandText}
                link={{ token: CLI_TOKEN, href: NPM_CLI }}
              />
            )}
          </code>
          <CopyButton
            text={commandText}
            label={isAiTab ? t("copyPromptAria") : t("copyAria")}
            onCopied={trackCopy}
          />
        </div>
      </div>
      <Hint activeKey={active} hint={hint} reduced={reduced} />
    </div>
  );
}
