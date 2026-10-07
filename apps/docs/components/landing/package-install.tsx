"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { AiSetupPrompt } from "@/components/ai-setup-prompt";
import { CommandRow } from "@/components/command-row";
import { type Locale, localizedPath } from "@/lib/i18n";
import { CLI_PACKAGE, NPM_INSTALL_COMMAND } from "@/lib/install-commands";
import { NPM_CLI } from "./links";

export const QUICKSTART_PATH = "/docs/quickstart";

const STEP_MARK_STYLE = {
  borderColor: "color-mix(in srgb, var(--v-glow) 45%, var(--border-default))",
  color: "var(--accent)",
} as const;

function StepCaption({ number, label }: { number: number; label: string }): ReactNode {
  return (
    <p className="vk-label m-0 flex items-center gap-2 px-3.5 pt-3">
      <span
        aria-hidden="true"
        className="inline-flex size-5 items-center justify-center rounded-full border font-mono normal-case tracking-normal"
        style={STEP_MARK_STYLE}
      >
        {number}
      </span>
      {label}
    </p>
  );
}

export function PackageInstall(): ReactNode {
  const t = useTranslations("landing.install");
  const locale = useLocale() as Locale;

  return (
    <div className="vk-w-install not-prose @container w-full">
      <div
        className="overflow-hidden rounded-xl border backdrop-blur-[6px]"
        style={{
          background: "color-mix(in srgb, var(--v-void) 72%, transparent)",
          borderColor: "var(--border-default)",
        }}
      >
        <ol className="m-0 list-none p-0">
          <li>
            <StepCaption number={1} label={t("stepInstall")} />
            <CommandRow
              command={NPM_INSTALL_COMMAND}
              link={{ token: CLI_PACKAGE, href: NPM_CLI }}
              label={t("copyAria")}
              event="copy-install-command"
              wrapsWhenNarrow
            />
          </li>
          <li className="border-t" style={{ borderColor: "var(--border-default)" }}>
            <StepCaption number={2} label={t("stepSetUp")} />
            <p className="m-0 px-3.5 pt-1.5 pb-3 text-sm leading-6 text-pretty text-[color:var(--text-body)]">
              {t.rich("setUp", {
                link: (chunks) => (
                  <Link
                    href={localizedPath(locale, QUICKSTART_PATH)}
                    className="vk-prose-link"
                    data-umami-event="install-box-quickstart"
                  >
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </li>
        </ol>
        <AiSetupPrompt label={t("agentLabel")} />
      </div>
    </div>
  );
}
