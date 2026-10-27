import { i18n, isLocale, localizedPath } from "@/lib/i18n";
import {
  HOME_PATH,
  SITE_MARKDOWN_PAGES,
  siteMarkdownPage,
  siteMarkdownSlug,
} from "@/lib/markdown-route";
import { homePath, SITE_URL } from "@/lib/site";
import { SITE_MARKDOWN } from "@/lib/site-markdown";

export const dynamic = "force-static";

export const dynamicParams = false;

export function generateStaticParams(): Array<{ lang: string; page: string }> {
  return i18n.languages.flatMap((lang) =>
    SITE_MARKDOWN_PAGES.map((page) => ({ lang, page: siteMarkdownSlug(page) })),
  );
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ lang: string; page: string }> },
): Promise<Response> {
  const { lang, page: slug } = await context.params;
  const page = siteMarkdownPage(slug);
  if (!isLocale(lang) || page === null) return new Response(null, { status: 404 });
  const path = page === HOME_PATH ? homePath(lang) : localizedPath(lang, page);
  const canonical = new URL(path, SITE_URL).href;
  return new Response(`${await SITE_MARKDOWN[page](lang)}\n`, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${canonical}>; rel="canonical"`,
    },
  });
}
