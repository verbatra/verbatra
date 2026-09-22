import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { StudioScreenshot } from "@/components/studio-screenshot";
import { type Locale, localizedPath } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { CommandBox } from "./command-box";
import { SKILLS_REPO_URL } from "./links";
import { Reveal } from "./reveal";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const LINK_CLASS =
  "inline-block font-medium text-[color:var(--accent)] underline decoration-[color:color-mix(in_srgb,var(--v-glow)_40%,transparent)] underline-offset-4 transition-colors hover:decoration-[color:var(--accent)]";

const EXCEL_ROWS = [
  { key: "cart.pay", source: "Pay now", target: "Bezahlen" },
  { key: "cart.total", source: "Total", target: "Gesamt" },
  { key: "nav.home", source: "Home", target: "Start" },
] as const;

const CHECK_JSON_EXCERPT = [
  '{ "command": "check",',
  '  "result": { "inSync": false, "locales": [',
  '    { "locale": "de", "missing": 0, "stale": 2 }',
  "  ] } }",
];

const SKILL_INSTALL = `npx skills@latest add verbatra/skills --skill verbatra-cli -y`;

function Frame({ children, className }: { children: ReactNode; className?: string }): ReactNode {
  return (
    <div
      className={cn("min-w-0 overflow-hidden rounded-xl border border-fd-border", className)}
      style={{ background: "var(--surface-bg)" }}
    >
      {children}
    </div>
  );
}

function Row({
  title,
  body,
  cta,
  href,
  flip = false,
  children,
}: {
  title: string;
  body: ReactNode;
  cta: string;
  href: string;
  flip?: boolean;
  children: ReactNode;
}): ReactNode {
  return (
    <Reveal className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-center lg:gap-16">
      <div className={cn("min-w-0", flip && "lg:order-2")}>
        <h3
          className="max-w-[18ch] font-semibold text-fd-foreground"
          style={{
            fontFamily: "var(--font-display)",
            fontSize: "clamp(1.5rem, 2.6vw, 2rem)",
            letterSpacing: "-0.02em",
            lineHeight: 1.15,
          }}
        >
          {title}
        </h3>
        <p className="mt-3.5 max-w-[44ch] text-base text-fd-muted-foreground">{body}</p>
        <a href={href} className={cn(LINK_CLASS, "mt-4")}>
          {cta}
        </a>
      </div>
      <div className={cn("min-w-0", flip && "lg:order-1")}>{children}</div>
    </Reveal>
  );
}

export async function Loop(): Promise<ReactNode> {
  const t = await getTranslations("landing.loop");
  const tInstall = await getTranslations("landing.install");
  const box = (command: string) => (
    <CommandBox command={command} label={tInstall("copyCommand", { command })} />
  );
  const locale = (await getLocale()) as Locale;
  const docs = (path: string) => localizedPath(locale, path);
  const codeTags = {
    code: (chunks: ReactNode) => (
      <code className="font-mono text-[14px] text-fd-foreground">{chunks}</code>
    ),
  };

  return (
    <Section width="wide" rhythm="lg" id="loop">
      <Reveal>
        <SectionHead title={t("heading")} />
      </Reveal>
      <div className="mt-[52px] grid gap-[72px]">
        <Row
          title={t("rows.excel.title")}
          body={t("rows.excel.body")}
          cta={t("rows.excel.cta")}
          href={docs("/docs/cli/export")}
        >
          <Frame>
            <div className="grid gap-2.5 p-5">
              {box("verbatra export")}
              {box("verbatra import translations.xlsx")}
            </div>
            <table className="w-full border-t border-fd-border font-mono text-[13px]">
              <thead>
                <tr style={{ background: "var(--surface-card)" }}>
                  {(["key", "source", "target"] as const).map((column) => (
                    <th
                      key={column}
                      scope="col"
                      className="px-4 py-2.5 text-left font-normal text-[color:var(--text-faint)]"
                    >
                      {t(`table.${column}`)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {EXCEL_ROWS.map((row) => (
                  <tr key={row.key} className="border-t border-fd-border">
                    <td className="px-4 py-2.5 text-fd-muted-foreground">{row.key}</td>
                    <td className="px-4 py-2.5 text-fd-muted-foreground">{row.source}</td>
                    <td className="px-4 py-2.5 text-fd-foreground">{row.target}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Frame>
        </Row>

        <Row
          title={t("rows.studio.title")}
          body={t("rows.studio.body")}
          cta={t("rows.studio.cta")}
          href={docs("/docs/review-in-studio")}
          flip
        >
          <StudioScreenshot
            shot="review"
            alt={t("rows.studio.alt")}
            elevated={false}
            className="my-0"
          />
        </Row>

        <Row
          title={t("rows.ci.title")}
          body={t.rich("rows.ci.body", codeTags)}
          cta={t("rows.ci.cta")}
          href={docs("/docs/ci-and-exit-codes")}
        >
          <Frame>
            <div className="p-5">{box("verbatra check --json")}</div>
            <pre
              className="overflow-x-auto border-t border-fd-border px-5 py-4 font-mono text-[13px] leading-relaxed text-fd-muted-foreground"
              style={{ background: "var(--v-void)" }}
            >
              <code>{CHECK_JSON_EXCERPT.join("\n")}</code>
            </pre>
          </Frame>
        </Row>

        <Row
          title={t("rows.agent.title")}
          body={t("rows.agent.body")}
          cta={t("rows.agent.cta")}
          href={docs("/docs/start-with-ai")}
          flip
        >
          <Frame>
            <div className="grid gap-2.5 p-5">
              {box(SKILL_INSTALL)}
              {box("verbatra mcp")}
            </div>
            <p className="flex flex-wrap gap-x-5 gap-y-2 px-5 pb-5 text-sm">
              <a href="/llms.txt" className={LINK_CLASS}>
                {t("links.llms")}
              </a>
              <a href="/llms-full.txt" className={LINK_CLASS}>
                {t("links.llmsFull")}
              </a>
              <a href={docs("/docs/cli/mcp")} className={LINK_CLASS}>
                {t("links.mcpDocs")}
              </a>
              <a
                href={SKILLS_REPO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className={LINK_CLASS}
              >
                verbatra/skills
              </a>
            </p>
          </Frame>
        </Row>
      </div>
    </Section>
  );
}
