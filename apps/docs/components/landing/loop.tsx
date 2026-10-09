import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { StudioScreenshot } from "@/components/studio-screenshot";
import { type Locale, localizedAnchorPath, localizedPath } from "@/lib/i18n";
import { SKILLS_INSTALL_COMMAND } from "@/lib/install-commands";
import { sectionNumber } from "@/lib/landing-sections";
import { cn } from "@/lib/utils";
import { CommandBox } from "./command-box";
import { SKILLS_PACK_ANCHORS, SKILLS_PACK_PAGE, SKILLS_REPO_URL } from "./links";
import { Section } from "./section";
import { SectionHead } from "./section-head";

const LINK_CLASS =
  "inline-block font-medium text-[color:var(--accent)] underline decoration-[color:color-mix(in_srgb,var(--v-glow)_40%,transparent)] underline-offset-4 transition-colors hover:decoration-[color:var(--accent)]";

export const LOOP_ROWS = ["excel", "studio", "ci", "agent"] as const;

type LoopRowId = (typeof LOOP_ROWS)[number];

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

function trackCta(target: string) {
  return {
    "data-umami-event": "click-cta",
    "data-umami-event-location": "loop",
    "data-umami-event-target": target,
  } as const;
}

function Frame({ children }: { children: ReactNode }): ReactNode {
  return (
    <div
      className="min-w-0 overflow-hidden rounded-xl border border-fd-border"
      style={{ background: "var(--surface-bg)" }}
    >
      {children}
    </div>
  );
}

function Row({
  id,
  title,
  body,
  cta,
  href,
  flip = false,
  children,
}: {
  id: LoopRowId;
  title: string;
  body: ReactNode;
  cta: string;
  href: string;
  flip?: boolean;
  children: ReactNode;
}): ReactNode {
  return (
    <div
      data-loop-row={id}
      data-reveal="0"
      className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:items-center lg:gap-16"
    >
      <div className={cn("min-w-0", flip && "lg:order-2")}>
        <h3 className="vk-h3 max-w-[18ch]">{title}</h3>
        <p className="mt-3.5 max-w-[44ch] text-base text-fd-muted-foreground">{body}</p>
        <a href={href} className={cn(LINK_CLASS, "mt-4")} {...trackCta(id)}>
          {cta}
        </a>
      </div>
      <div className={cn("min-w-0", flip && "lg:order-1")}>{children}</div>
    </div>
  );
}

export async function Loop(): Promise<ReactNode> {
  const t = await getTranslations("landing.loop");
  const tInstall = await getTranslations("landing.install");
  const box = (command: string) => (
    <CommandBox command={command} label={tInstall("copyCommand", { command })} scrolls />
  );
  const locale = (await getLocale()) as Locale;
  const docs = (path: string) => localizedPath(locale, path);
  const codeTags = {
    code: (chunks: ReactNode) => (
      <code className="font-mono text-sm text-fd-foreground">{chunks}</code>
    ),
  };

  return (
    <Section width="wide" rhythm="lg" id="loop">
      <SectionHead
        id="loop-heading"
        title={t("heading")}
        step={{ number: sectionNumber("loop"), label: t("eyebrow") }}
        reveal
      />
      <div className="mt-[52px] grid gap-[72px]">
        <Row
          id="excel"
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
            <table className="vk-mono-sm w-full border-t border-fd-border font-mono">
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
          id="studio"
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
          id="ci"
          title={t("rows.ci.title")}
          body={t.rich("rows.ci.body", codeTags)}
          cta={t("rows.ci.cta")}
          href={docs("/docs/ci-and-exit-codes")}
        >
          <Frame>
            <div className="p-5">{box("verbatra check --json")}</div>
            <pre className="vk-mono-sm vk-terminal-scroll border-t border-fd-border px-5 py-4 font-mono leading-relaxed text-fd-muted-foreground">
              <code>{CHECK_JSON_EXCERPT.join("\n")}</code>
            </pre>
          </Frame>
        </Row>

        <Row
          id="agent"
          title={t("rows.agent.title")}
          body={t("rows.agent.body")}
          cta={t("rows.agent.cta")}
          href={docs("/docs/start-with-ai")}
          flip
        >
          <Frame>
            <div className="grid gap-2.5 p-5">
              {box(SKILLS_INSTALL_COMMAND)}
              {box("verbatra mcp")}
            </div>
            <p className="flex flex-wrap gap-x-5 gap-y-2 px-5 pb-5 text-sm">
              <a href="/llms.txt" className={LINK_CLASS} {...trackCta("llms")}>
                {t("links.llms")}
              </a>
              <a href="/llms-full.txt" className={LINK_CLASS} {...trackCta("llms-full")}>
                {t("links.llmsFull")}
              </a>
              <a href={docs("/docs/cli/mcp")} className={LINK_CLASS} {...trackCta("mcp-docs")}>
                {t("links.mcpDocs")}
              </a>
              <a
                href={SKILLS_REPO_URL}
                target="_blank"
                rel="noreferrer noopener"
                className={LINK_CLASS}
                data-umami-event="outbound-link"
                data-umami-event-target="skills-repo"
                data-umami-event-location="loop"
              >
                verbatra/skills
              </a>
              <a
                href={localizedAnchorPath(locale, SKILLS_PACK_PAGE, SKILLS_PACK_ANCHORS)}
                className={LINK_CLASS}
                {...trackCta("skills-docs")}
              >
                {t("links.skillsDocs")}
              </a>
            </p>
          </Frame>
        </Row>
      </div>
    </Section>
  );
}
