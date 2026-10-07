import type * as PageTree from "fumadocs-core/page-tree";
import { i18n } from "@/lib/i18n";
import { readPublishedSchemas, SCHEMA_PATH, schemaUrl } from "@/lib/json-schemas";
import { markdownUrl } from "@/lib/markdown-route";
import { PAGE_TYPES } from "@/lib/page-type";
import { SITE_URL } from "@/lib/site";
import { source } from "@/lib/source";
import { SUPPORTED_AGENT_CLIENTS } from "@/lib/structured-data";

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

function renderSchemas(): string {
  const lines = readPublishedSchemas().map(
    (schema) => `- [${String(schema.document.title)}](${schemaUrl(schema.name)})`,
  );
  return `## JSON Schemas\n\nDraft 2020-12 schemas for the config and every \`--json\` document, also listed at ${SITE_URL}${SCHEMA_PATH}. \`v1\` tracks envelope \`version: 1\`; unknown fields are allowed, since new ones can appear.\n\n${lines.join("\n")}`;
}

export function GET(): Response {
  const body = `# verbatra

> verbatra is a CLI and SDK that keeps your i18n locale files in sync, translating only the keys that are new or whose source text changed, through your choice of AI or machine-translation provider.

verbatra is open source and MIT licensed. You maintain one source locale; on each run it diffs the source against a committed lock file and sends only the new or changed keys to your provider, leaving current translations untouched. Placeholder, ICU, and inline markup integrity are checked after every translation, and any result that breaks a placeholder, its message syntax, or its inline markup is withheld. Written files round-trip in exact document order: existing keys keep their positions and new keys are appended in source order, so translated files diff cleanly. Suspicious results are flagged for review, and the local Studio dashboard (the \`verbatra studio\` command) shows project state, drift, and the review queue.

- Repository: https://github.com/verbatra/verbatra
- npm packages: @verbatra/cli (the \`verbatra\` command), @verbatra/sdk (programmatic API), @verbatra/studio (local review dashboard, loaded by \`verbatra studio\`), @verbatra/mcp (stdio MCP server, loaded by \`verbatra mcp\`)
- Translation providers: Anthropic, OpenAI, Gemini, DeepL, Google Cloud Translation, openai-compatible (local or self-hosted), LibreTranslate (self-hosted machine translation)
- Human-only mode: provider \`none\` turns machine translation off; keys are filled only from the translation memory or by a translator through export and import
- i18n formats: i18next, vue-i18n, next-intl, ngx-translate, Flutter ARB, YAML, XLIFF, Java/Spring properties, Apple .strings, Xcode String Catalogs, Android strings.xml, gettext .po/.pot, INI, and .NET .resx
- Frameworks: React, Next.js, Vue, Nuxt, Angular, Node.js, SvelteKit, Astro, React Native, Flutter, Spring, iOS and macOS, Android, .NET
- Requires Node.js >= 22.18.0

## For AI agents

- Every page below links to its Markdown source. Append \`.md\` to any docs URL, or send \`Accept: text/markdown\`, to get Markdown instead of HTML. The full text of every page is at ${SITE_URL}/llms-full.txt. Each page there and each Markdown response opens with YAML frontmatter naming its title, description, and page type (one of ${PAGE_TYPES.join(", ")}), so you can tell a walkthrough from the authoritative reference.
- MCP server: \`npx -y @verbatra/mcp\` (or \`verbatra mcp\`) serves a verbatra project over stdio to ${SUPPORTED_AGENT_CLIENTS.join(", ")}, and any other stdio client. Tools that call a paid provider stay off the tool list until spending is granted with \`--allow-spend\` or \`VERBATRA_MCP_ALLOW_SPEND\`. Client setup: ${SITE_URL}/docs/connect-an-mcp-client.md
- Skills and Claude Code plugin: https://github.com/verbatra/skills
- Free and read-only: \`check\`, \`diff\`, \`doctor\`, \`translate --dry-run\`. Spends provider tokens: \`translate\`, \`watch\`. Ask the person before a spending run, and never read or print an API key value.
- Pass \`--json\` for one envelope on stdout and branch on the exit code: 0 clean, 1 ran but not clean, 2 could not run, 3 a human-only project (provider \`none\`) left keys for a person. Recipes: ${SITE_URL}/docs/agent-recipes.md. JSON Schemas for every envelope and stderr record: ${SITE_URL}${SCHEMA_PATH}
- Setting verbatra up for someone: ${SITE_URL}/docs/start-with-ai.md

${renderSections()}

${renderSchemas()}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
