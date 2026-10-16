import type * as PageTree from "fumadocs-core/page-tree";
import { getTranslations } from "next-intl/server";
import { GITHUB_URL, RELEASES_URL } from "@/components/landing/links";
import { i18n, type Locale } from "@/lib/i18n";
import { readPublishedSchemas, SCHEMA_PATH, schemaUrl } from "@/lib/json-schemas";
import { FORMAT_DISPLAY, MACHINE_PROVIDER_IDS, SUPPORTED_FORMAT_IDS } from "@/lib/landing-facts";
import { PROVIDER_DISPLAY, providerShortLabel } from "@/lib/landing-providers";
import {
  type MarkdownPage,
  markdownUrl,
  SITE_MARKDOWN_PAGES,
  SITE_PAGE_META,
  siteMarkdownUrl,
} from "@/lib/markdown-route";
import { PAGE_TYPES } from "@/lib/page-type";
import { NODE_RANGE, SITE_URL } from "@/lib/site";
import { source } from "@/lib/source";
import { SUPPORTED_AGENT_CLIENTS, SUPPORTED_FRAMEWORKS } from "@/lib/structured-data";

export const dynamic = "force-static";

type PageInfo = { title: string; url: string; description?: string | undefined };

function pageLine(info: PageInfo): string {
  const url = new URL(markdownUrl(info.url), SITE_URL).href;
  const desc = info.description ? `: ${info.description}` : "";
  return `- [${info.title}](${url})${desc}`;
}

function folderPages(folder: PageTree.Folder): PageTree.Item[] {
  const pages: PageTree.Item[] = folder.index ? [folder.index] : [];
  for (const child of folder.children) {
    if (child.type === "page") pages.push(child);
    if (child.type === "folder") pages.push(...folderPages(child));
  }
  return pages;
}

function sectionNodes(nodes: PageTree.Node[]): PageTree.Node[] {
  return nodes.flatMap((node) =>
    node.type === "folder" && node.root ? sectionNodes(node.children) : [node],
  );
}

function renderSections(): string {
  const byUrl = new Map<string, PageInfo>();
  for (const page of source.getPages(i18n.defaultLanguage)) {
    byUrl.set(page.url, {
      title: page.data.title,
      url: page.url,
      description: page.data.description,
    });
  }

  const lookup = (node: PageTree.Item): PageInfo | undefined => byUrl.get(node.url);

  const sections: string[] = [];
  for (const node of sectionNodes(source.getPageTree(i18n.defaultLanguage).children)) {
    if (node.type === "page") {
      const info = lookup(node);
      if (info) sections.push(`## ${info.title}\n\n${pageLine(info)}`);
      continue;
    }
    if (node.type !== "folder") continue;
    const heading = typeof node.name === "string" ? node.name : "Documentation";
    const seen = new Set<string>();
    const children = folderPages(node)
      .filter((child) => {
        if (seen.has(child.url)) return false;
        seen.add(child.url);
        return true;
      })
      .map(lookup)
      .filter((info): info is PageInfo => info !== undefined)
      .map(pageLine);
    if (children.length > 0) sections.push(`## ${heading}\n\n${children.join("\n")}`);
  }
  return sections.join("\n\n");
}

type SitePageMeta = { title: string; description: string };

async function sitePageMeta(locale: Locale, page: MarkdownPage): Promise<SitePageMeta> {
  const t = await getTranslations({ locale, namespace: SITE_PAGE_META[page] });
  return { title: t("title"), description: t("description") };
}

function siteUrl(locale: Locale, page: MarkdownPage): string {
  return new URL(siteMarkdownUrl(locale, page), SITE_URL).href;
}

async function renderSitePages(): Promise<string> {
  const locale = i18n.defaultLanguage;
  const lines = await Promise.all(
    SITE_MARKDOWN_PAGES.map(async (page) => {
      const meta = await sitePageMeta(locale, page);
      return `- [${meta.title}](${siteUrl(locale, page)}): ${meta.description}`;
    }),
  );
  return `## Site\n\nThe landing page, the comparison with other tools and the legal pages, each as Markdown.\n\n${lines.join("\n")}`;
}

async function renderTranslations(): Promise<string> {
  const others = i18n.languages.filter((locale) => locale !== i18n.defaultLanguage);
  const lines = await Promise.all(
    others.map(async (locale) => {
      const links = await Promise.all(
        SITE_MARKDOWN_PAGES.map(
          async (page) => `[${(await sitePageMeta(locale, page)).title}](${siteUrl(locale, page)})`,
        ),
      );
      return `- ${locale}: ${links.join(", ")}`;
    }),
  );
  return `## Translations\n\nThe site pages above in every other locale. Docs pages follow the same pattern, for example ${SITE_URL}/de/docs/quickstart.md.\n\n${lines.join("\n")}`;
}

function providerNames(): string {
  return MACHINE_PROVIDER_IDS.map((id) => {
    const short = providerShortLabel(id);
    const label = PROVIDER_DISPLAY[id].label;
    return short === label ? label : `${short} (${label})`;
  }).join(", ");
}

function formatNames(): string {
  return SUPPORTED_FORMAT_IDS.map((id) => FORMAT_DISPLAY[id].label).join(", ");
}

const README_URL = `${GITHUB_URL}#readme`;

function renderOptional(): string {
  return `## Optional\n\n- [Release notes](${RELEASES_URL}): every published version of the CLI, SDK, Studio and MCP server, with its changes\n- [README](${README_URL}): the project overview on GitHub`;
}

function renderSchemas(): string {
  const lines = readPublishedSchemas().map(
    (schema) => `- [${String(schema.document.title)}](${schemaUrl(schema.name)})`,
  );
  return `## JSON Schemas\n\nDraft 2020-12 schemas for the config and every \`--json\` document, also listed at ${SITE_URL}${SCHEMA_PATH}. \`v1\` tracks envelope \`version: 1\`; unknown fields are allowed, since new ones can appear.\n\n${lines.join("\n")}`;
}

export async function GET(): Promise<Response> {
  const t = await getTranslations({ locale: i18n.defaultLanguage, namespace: "landing.meta" });
  const body = `# Verbatra

> ${t("definition")}

Verbatra is open source and MIT licensed. You maintain one source locale; on each run it diffs the source against a committed lock file and sends only the new or changed keys to your provider, leaving current translations untouched. Placeholder, ICU, and inline markup integrity are checked after every translation, and any result that breaks a placeholder, its message syntax, or its inline markup is withheld. Written files round-trip in exact document order: existing keys keep their positions and new keys are appended in source order, so translated files diff cleanly. Suspicious results are flagged for review, and the local Studio dashboard (the \`verbatra studio\` command) shows project state, drift, and the review queue.

- Repository: ${GITHUB_URL}
- npm packages: @verbatra/cli (the \`verbatra\` command), @verbatra/sdk (programmatic API), @verbatra/studio (local review dashboard, loaded by \`verbatra studio\`), @verbatra/mcp (stdio MCP server, loaded by \`verbatra mcp\`)
- Translation providers: ${providerNames()}
- Human-only mode: provider \`none\` turns machine translation off; keys are filled only from the translation memory or by a translator through export and import
- i18n formats: ${formatNames()}
- Frameworks: ${SUPPORTED_FRAMEWORKS.join(", ")}
- Requires Node.js ${NODE_RANGE}

## For AI agents

- Every page below links to its Markdown source. Append \`.md\` to any docs URL (\`/index.md\` for the landing page), or send \`Accept: text/markdown\`, to get Markdown instead of HTML. The full text of the landing page, the comparison and every docs page is at ${SITE_URL}/llms-full.txt. Each page there and each Markdown response opens with YAML frontmatter naming its title and description, and on docs pages its page type (one of ${PAGE_TYPES.join(", ")}), so you can tell a walkthrough from the authoritative reference.
- MCP server: \`npx -y @verbatra/mcp\` (or \`verbatra mcp\`) serves a Verbatra project over stdio to ${SUPPORTED_AGENT_CLIENTS.join(", ")}, and any other stdio client. Tools that call a paid provider stay off the tool list until spending is granted with \`--allow-spend\` or \`VERBATRA_MCP_ALLOW_SPEND\`. Client setup: ${SITE_URL}/docs/connect-an-mcp-client.md
- Skills and Claude Code plugin: https://github.com/verbatra/skills
- Free and read-only: \`check\`, \`diff\`, \`doctor\` (without \`--live\`), \`translate --dry-run\`. Spends provider tokens: \`translate\`, \`watch\`. Ask the person before a spending run, and never read or print an API key value.
- Pass \`--json\` for one envelope on stdout and branch on the exit code: 0 clean, 1 ran but not clean, 2 could not run, 3 a human-only project (provider \`none\`) left keys for a person. Recipes: ${SITE_URL}/docs/agent-recipes.md. JSON Schemas for every envelope and stderr record: ${SITE_URL}${SCHEMA_PATH}
- Setting Verbatra up for someone: ${SITE_URL}/docs/start-with-ai.md
- Contributing to this repository with a coding agent: ${GITHUB_URL}/blob/main/AGENTS.md

${await renderSitePages()}

${renderSections()}

${renderSchemas()}

${await renderTranslations()}

${renderOptional()}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
