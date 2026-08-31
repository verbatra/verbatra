import type * as PageTree from "fumadocs-core/page-tree";
import { i18n } from "@/lib/i18n";
import { SITE_URL } from "@/lib/site";
import { source } from "@/lib/source";

export const dynamic = "force-static";

type PageInfo = { title: string; url: string; description?: string | undefined };

function pageLine(info: PageInfo): string {
  const url = new URL(info.url, SITE_URL).href;
  const desc = info.description ? `: ${info.description}` : "";
  return `- [${info.title}](${url})${desc}`;
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
  for (const node of source.getPageTree(i18n.defaultLanguage).children) {
    if (node.type === "page") {
      const info = lookup(node);
      if (info) sections.push(`## ${info.title}\n\n${pageLine(info)}`);
      continue;
    }
    if (node.type !== "folder") continue;
    const heading = typeof node.name === "string" ? node.name : "Documentation";
    const seen = new Set<string>();
    const children = [node.index, ...node.children]
      .filter((child): child is PageTree.Item => child?.type === "page")
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

export function GET(): Response {
  const body = `# verbatra

> verbatra is a CLI and SDK that keeps your i18n locale files in sync, translating only the keys that are new or whose source text changed, through your choice of AI or machine-translation provider.

verbatra is open source and MIT licensed. You maintain one source locale; on each run it diffs the source against a committed lock file and sends only the new or changed keys to your provider, leaving current translations untouched. Placeholder and ICU integrity are checked after every translation, and any result that breaks a placeholder is withheld. Written files round-trip in exact document order: existing keys keep their positions and new keys are appended in source order, so translated files diff cleanly. Suspicious results are flagged for review, and the local Studio dashboard (the \`verbatra studio\` command) shows project state, drift, and the review queue.

- Repository: https://github.com/verbatra/verbatra
- npm packages: @verbatra/cli (the \`verbatra\` command), @verbatra/sdk (programmatic API), @verbatra/studio (local review dashboard, loaded by \`verbatra studio\`)
- Translation providers: Anthropic, OpenAI, Gemini, DeepL, openai-compatible (local or self-hosted)
- i18n formats: i18next, vue-i18n, next-intl, ngx-translate, Flutter ARB, YAML, XLIFF, Java/Spring properties, Apple .strings, Xcode String Catalogs, Android strings.xml, and gettext .po/.pot
- Frameworks: React, Vue, Angular, Node.js, Flutter
- Requires Node.js >= 22.14.0

${renderSections()}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
