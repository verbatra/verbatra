import { getLocale, getTranslations } from "next-intl/server";
import type { ReactNode } from "react";
import { type Locale, localizedAnchorPath, localizedPath } from "@/lib/i18n";
import { SKILLS_INSTALL_COMMAND } from "@/lib/install-commands";
import { cn } from "@/lib/utils";
import { CommandBox } from "./command-box";
import { SKILLS_PACK_ANCHORS, SKILLS_PACK_PAGE } from "./links";
import { Rail } from "./rail";
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
  '  "result": {',
  '    "inSync": false,',
  '    "locales": [{ "locale": "de",',
  '      "missing": 0, "stale": 2 }]',
  "  } }",
];

function Frame({ children }: { children: ReactNode }): ReactNode {
  return (
    <div
      className="min-w-0 self-start overflow-hidden rounded-xl border border-fd-border"
      style={{ background: "var(--surface-bg)" }}
    >
      {children}
    </div>
  );
}

function Column({
  title,
  body,
  cta,
  href,
  children,
}: {
  title: string;
  body: ReactNode;
  cta: string;
  href: string;
  children: ReactNode;
}): ReactNode {
  return (
    <article className="vk-rail-item grid min-w-0 content-start gap-6 lg:row-span-2 lg:grid-rows-subgrid">
      <div className="min-w-0">
        <h3 className="vk-h4 max-w-[24ch]">{title}</h3>
        <p className="mt-2.5 max-w-[44ch] text-sm leading-relaxed text-fd-muted-foreground">
          {body}
        </p>
        <a href={href} className={cn(LINK_CLASS, "mt-3 text-sm")}>
          {cta}
        </a>
      </div>
      {children}
    </article>
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
      <code className="font-mono text-sm text-fd-foreground">{chunks}</code>
    ),
  };

  return (
    <Section width="wide" rhythm="sm" id="loop">
      <div>
        <SectionHead id="loop-heading" title={t("heading")} />
      </div>
      <Rail labelledBy="loop-heading" className="vk-loop-rail mt-10 lg:mt-12">
        <div className="vk-rail-track lg:grid-cols-3 lg:grid-rows-[auto_auto]">
          <Column
            title={t("rows.ci.title")}
            body={t.rich("rows.ci.body", codeTags)}
            cta={t("rows.ci.cta")}
            href={docs("/docs/ci-and-exit-codes")}
          >
            <Frame>
              <div className="p-4 lg:p-3 xl:p-4">{box("verbatra check --json")}</div>
              <pre
                className="overflow-x-auto border-t border-fd-border px-5 py-4 font-mono text-sm leading-relaxed text-fd-muted-foreground lg:text-xs xl:text-sm"
                style={{ background: "var(--v-void)" }}
              >
                <code>{CHECK_JSON_EXCERPT.join("\n")}</code>
              </pre>
            </Frame>
          </Column>

          <Column
            title={t("rows.excel.title")}
            body={t("rows.excel.body")}
            cta={t("rows.excel.cta")}
            href={docs("/docs/cli/export")}
          >
            <Frame>
              <div className="grid gap-2.5 p-4 lg:p-3 xl:p-4">
                {box("verbatra export")}
                {box("verbatra import translations.xlsx")}
              </div>
              <table className="w-full border-t border-fd-border font-mono text-sm [overflow-wrap:anywhere]">
                <thead>
                  <tr style={{ background: "var(--surface-card)" }}>
                    {(["key", "source", "target"] as const).map((column) => (
                      <th
                        key={column}
                        scope="col"
                        className="px-3 py-2 text-left font-normal text-[color:var(--text-faint)]"
                      >
                        {t(`table.${column}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {EXCEL_ROWS.map((row) => (
                    <tr key={row.key} className="border-t border-fd-border">
                      <td className="px-3 py-2 text-fd-muted-foreground">{row.key}</td>
                      <td className="px-3 py-2 text-fd-muted-foreground">{row.source}</td>
                      <td className="px-3 py-2 text-fd-foreground">{row.target}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Frame>
          </Column>

          <Column
            title={t("rows.agent.title")}
            body={t("rows.agent.body")}
            cta={t("rows.agent.cta")}
            href={docs("/docs/start-with-ai")}
          >
            <Frame>
              <div className="grid gap-2.5 p-4 lg:p-3 xl:p-4">
                {box(SKILLS_INSTALL_COMMAND)}
                {box("verbatra mcp")}
              </div>
              <p className="flex flex-wrap gap-x-5 gap-y-2 border-t border-fd-border px-5 py-4 text-sm">
                <a href="/llms.txt" className={LINK_CLASS}>
                  {t("links.llms")}
                </a>
                <a href={docs("/docs/cli/mcp")} className={LINK_CLASS}>
                  {t("links.mcpDocs")}
                </a>
                <a
                  href={localizedAnchorPath(locale, SKILLS_PACK_PAGE, SKILLS_PACK_ANCHORS)}
                  className={LINK_CLASS}
                >
                  {t("links.skillsDocs")}
                </a>
              </p>
            </Frame>
          </Column>
        </div>
      </Rail>
    </Section>
  );
}
