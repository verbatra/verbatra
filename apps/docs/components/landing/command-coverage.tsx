import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { COMMAND_GROUPS } from "@/lib/cli-commands";
import { Section } from "./section";
import { SectionHead } from "./section-head";

export async function CommandCoverage(): Promise<ReactNode> {
  const t = await getTranslations("landing.commands");

  return (
    <Section width="wide" rhythm="md">
      <SectionHead title={t("heading")} lead={t("lead")} />
      <div className="mt-10 grid gap-x-10 gap-y-8 md:grid-cols-2 lg:grid-cols-3">
        {COMMAND_GROUPS.map((group) => (
          <div key={group.key}>
            <h3 className="font-mono text-xs lowercase tracking-[0.12em] text-[color:var(--text-faint)]">
              {t(`groups.${group.key}`)}
            </h3>
            <dl className="mt-3 divide-y divide-fd-border border-y border-fd-border">
              {group.commands.map((command) => (
                <div key={command} className="py-2.5 text-[13px] leading-relaxed">
                  <dt className="me-3 inline font-mono text-[color:var(--accent)]">{command}</dt>
                  <dd className="inline text-fd-muted-foreground">{t(`items.${command}`)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
      <p className="mt-6 text-sm text-fd-muted-foreground">{t("helpNote")}</p>
    </Section>
  );
}
