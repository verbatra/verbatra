import { compareMarkdown } from "@/lib/compare-markdown";
import { i18n } from "@/lib/i18n";
import { landingMarkdown } from "@/lib/landing-markdown";
import { absolutizeMarkdownLinks } from "@/lib/markdown-links";
import { pageFrontmatter } from "@/lib/page-frontmatter";
import { SITE_URL } from "@/lib/site";
import { source } from "@/lib/source";

export const dynamic = "force-static";

async function renderPage(page: ReturnType<typeof source.getPages>[number]): Promise<string> {
  const url = new URL(page.url, SITE_URL).href;
  const markdown = absolutizeMarkdownLinks(await page.data.getText("processed"));
  return `${pageFrontmatter(page.data)}# ${page.data.title} (${url})\n\n${markdown}`;
}

export async function GET(): Promise<Response> {
  const locale = i18n.defaultLanguage;
  const pages = source.getPages(locale);
  const sections = await Promise.all(pages.map(renderPage));
  const site = await Promise.all([landingMarkdown(locale), compareMarkdown(locale)]);

  const body = `# Verbatra (full documentation)

> This is the landing page, the comparison with other tools and the complete Verbatra
> documentation in a single file, for AI agents that ingest content directly. For a curated
> index of links instead, see ${SITE_URL}/llms.txt.

${site.join("\n\n")}

${sections.join("\n\n")}
`;

  return new Response(body, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
