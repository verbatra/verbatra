import { getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { COMMAND_GROUPS } from "@/lib/cli-commands";
import { Section } from "./section";
import { SectionHead } from "./section-head";

export async function CommandCoverage(): Promise<ReactNode> {
  const t = await getTranslations("landing.commands");

  return (
    <Section width="wide" rhythm="sm">
      <SectionHead title={t("heading")} lead={t("lead")} />
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {COMMAND_GROUPS.map((group) => (
          <div
            key={group.key}
            className="rounded-xl border border-fd-border p-5"
            style={{ background: "var(--surface-card)" }}
          >
            <h3
              className="font-semibold text-fd-foreground"
              style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-h3)" }}
            >
              {t(`groups.${group.key}`)}
            </h3>
            <dl className="mt-4 grid gap-3">
              {group.commands.map((command) => (
                <div key={command}>
                  <dt className="font-mono text-[13px] text-[color:var(--accent)]">
                    verbatra {command}
                  </dt>
                  <dd className="mt-1 text-[13px] leading-relaxed text-fd-muted-foreground">
                    {t(`items.${command}`)}
                  </dd>
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
