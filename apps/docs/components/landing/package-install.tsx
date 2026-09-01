"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useLocale, useTranslations } from "next-intl";
import { type ReactNode, useState } from "react";
import { HighlightedCommand } from "@/components/ui/command-line";
import { TabList } from "@/components/ui/tabs";
import { AI_SETUP_PROMPT } from "@/lib/ai-setup-prompt";
import { type Locale, localizedPath } from "@/lib/i18n";
import { trackUmamiEvent } from "@/lib/umami";
import { useCopyToClipboard } from "@/lib/use-copy-to-clipboard";
import { cn } from "@/lib/utils";
import { NPM_CLI } from "./links";

const MANAGERS = [
  { id: "npm", label: "npm", command: "npm i -D @verbatra/cli" },
  { id: "pnpm", label: "pnpm", command: "pnpm add -D @verbatra/cli" },
  { id: "yarn", label: "yarn", command: "yarn add -D @verbatra/cli" },
  { id: "bun", label: "bun", command: "bun add -d @verbatra/cli" },
] as const;

const AI_TAB_ID = "ai" as const;
type ActiveTab = (typeof MANAGERS)[number]["id"] | typeof AI_TAB_ID;

const CLI_TOKEN = "@verbatra/cli";
const WINDOW_DOTS = ["#ff5f56", "#ffbd2e", "#27c93f"] as const;
const TAB_CLASS =
  "rounded px-3 py-1.5 font-mono text-xs lowercase transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";
const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const HINT_LINK_CLASS =
  "underline decoration-fd-border underline-offset-4 transition-colors hover:text-[var(--accent)] hover:decoration-[var(--accent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]";

type BubbleVariant = "desktop" | "mobile";

const BUBBLE_WRAPPER_CLASS: Record<BubbleVariant, string> = {
  desktop:
    "z-20 hidden lg:absolute lg:left-full lg:top-1/2 lg:block lg:w-60 lg:-translate-y-1/2 lg:ml-3",
  mobile: "absolute inset-x-0 top-full z-20 mt-3 lg:hidden",
};

function HintBubble({
  variant,
  activeKey,
  hint,
  reduced,
}: {
  variant: BubbleVariant;
  activeKey: string;
  hint: ReactNode | null;
  reduced: boolean;
}): ReactNode {
  const offset = variant === "desktop" ? { x: -8 } : { y: -8 };
  return (
    <div className={BUBBLE_WRAPPER_CLASS[variant]} aria-live="polite">
      <AnimatePresence mode="wait">
        {hint ? (
          <motion.div
            key={activeKey}
            className="relative isolate"
            initial={reduced ? false : { opacity: 0, ...offset }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={reduced ? undefined : { opacity: 0, ...offset }}
            transition={reduced ? { duration: 0 } : { duration: 0.2, ease: EASE_OUT }}
          >
            {variant === "desktop" ? (
              <span
                aria-hidden="true"
                className="-z-10 absolute left-0 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 border-b border-l border-fd-border"
                style={{ background: "var(--surface-card)" }}
              />
            ) : null}
            <div
              className="rounded-xl border border-fd-border px-3 py-2.5 text-xs leading-relaxed text-fd-muted-foreground"
              style={{ background: "var(--surface-card)", boxShadow: "var(--shadow-panel)" }}
            >
              {hint}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

export function PackageInstall(): ReactNode {
  const t = useTranslations("landing.install");
  const locale = useLocale() as Locale;
  const [active, setActive] = useState<ActiveTab>("npm");
  const [copied, copy] = useCopyToClipboard();
  const reduced = useReducedMotion() ?? false;
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

  return (
    <div className="not-prose w-full max-w-[28rem]">
      <div className="relative">
        <div
          className="overflow-hidden rounded-2xl border border-fd-border"
          style={{ background: "var(--surface-card)", boxShadow: "var(--shadow-panel)" }}
        >
          <div className="flex items-center gap-3 border-b border-fd-border px-4 py-2.5">
            <span className="flex gap-1.5" aria-hidden="true">
              {WINDOW_DOTS.map((color) => (
                <span
                  key={color}
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: color }}
                />
              ))}
            </span>
            <TabList
              tabs={MANAGERS}
              active={active}
              onSelect={(id) => setActive(id as (typeof MANAGERS)[number]["id"])}
              ariaLabel={t("tablistLabel")}
              className="flex"
              tabClassName={TAB_CLASS}
            />
            <button
              type="button"
              aria-pressed={isAiTab}
              onClick={() => setActive(AI_TAB_ID)}
              className={cn(
                TAB_CLASS,
                "ml-auto border-l border-fd-border pl-3",
                isAiTab
                  ? "text-fd-foreground"
                  : "text-fd-muted-foreground hover:text-fd-foreground",
              )}
              style={isAiTab ? { boxShadow: "inset 0 -2px 0 var(--v-glow)" } : undefined}
            >
              {t("aiTabLabel")}
            </button>
          </div>
          <div
            className="flex items-center gap-3 px-4 py-3 font-mono text-sm"
            style={{ background: "var(--surface-bg)" }}
          >
            {isAiTab ? null : (
              <span aria-hidden="true" style={{ color: "var(--v-glow)" }}>
                $
              </span>
            )}
            <code
              aria-hidden={isAiTab || undefined}
              className={cn("text-fd-foreground", isAiTab && "block min-w-0 flex-1 truncate")}
            >
              {isAiTab ? (
                commandText
              ) : (
                <HighlightedCommand
                  command={commandText}
                  link={{ token: CLI_TOKEN, href: NPM_CLI }}
                />
              )}
            </code>
            <button
              type="button"
              onClick={() => {
                copy(commandText);
                if (isAiTab) {
                  trackUmamiEvent("copy-ai-prompt");
                } else {
                  trackUmamiEvent("copy-install-command", { manager: active });
                }
              }}
              aria-label={isAiTab ? t("copyPromptAria") : t("copyAria")}
              className="ms-auto rounded-md border border-fd-border px-2 py-1 text-xs text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--focus-ring)]"
            >
              {copied ? t("copied") : t("copy")}
            </button>
          </div>
        </div>
        <HintBubble variant="desktop" activeKey={active} hint={hint} reduced={reduced} />
        <HintBubble variant="mobile" activeKey={active} hint={hint} reduced={reduced} />
      </div>
      <div aria-hidden="true" className="h-[6.5rem] lg:hidden" />
    </div>
  );
}
