import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { type Locale, localizedPath } from "@/lib/i18n";
import { GithubIcon } from "./github-icon";
import { SKILLS_REPO_URL } from "./links";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const SKILL_INSTALL = "npx skills@latest add verbatra/skills --skill verbatra-cli -y";

type AgentRow = {
  key: string;
  href: string;
  external: boolean;
};

function ExternalMark(): ReactNode {
  return (
    <span aria-hidden="true" className="ml-1">
      ↗
    </span>
  );
}

export async function Agents(): Promise<ReactNode> {
  const t = await getTranslations("landing.agents");
  const locale = (await getLocale()) as Locale;

  const rows: ReadonlyArray<AgentRow> = [
    { key: "mcp", href: localizedPath(locale, "/docs/start-with-ai"), external: false },
    { key: "skills", href: SKILLS_REPO_URL, external: true },
    { key: "llms", href: "/llms.txt", external: true },
  ];

  return (
    <Section width="wide" rhythm="md" id="agents">
      <SectionHead title={t("heading")} lead={t("lead")} />
      <ul className="mt-10 grid gap-4 md:grid-cols-3">
        {rows.map((row) => (
          <li
            key={row.key}
            className="flex flex-col rounded-xl border border-fd-border p-5"
            style={{ background: "var(--surface-card)" }}
          >
            <h3
              className="font-semibold text-fd-foreground"
              style={{ fontFamily: "var(--font-display)", fontSize: "var(--text-h3)" }}
            >
              {t(`items.${row.key}.title`)}
            </h3>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-fd-muted-foreground">
              {t(`items.${row.key}.body`)}
            </p>
            <a
              href={row.href}
              className="mt-4 inline-flex min-h-6 items-center gap-1.5 self-start font-medium text-[color:var(--accent)] underline underline-offset-4"
              {...(row.external ? { target: "_blank", rel: "noreferrer noopener" } : {})}
            >
              {row.key === "skills" ? <GithubIcon size={16} /> : null}
              {t(`items.${row.key}.cta`)}
              {row.external ? <ExternalMark /> : null}
            </a>
          </li>
        ))}
      </ul>
      <div
        className="mt-6 flex flex-col gap-2 rounded-xl border border-fd-border px-4 py-4 sm:flex-row sm:items-center sm:gap-4"
        style={{ background: "var(--surface-card)" }}
      >
        <span className="shrink-0 text-[13px] text-[color:var(--text-faint)]">
          {t("installLabel")}
        </span>
        <code className="min-w-0 overflow-x-auto whitespace-pre font-mono text-[13px] text-fd-foreground">
          {SKILL_INSTALL}
        </code>
      </div>
    </Section>
  );
}
