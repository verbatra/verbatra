import { isLocale } from "@/lib/i18n";
import { source } from "@/lib/source";

export const dynamic = "force-static";

export function generateStaticParams() {
  return source.generateParams();
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ lang: string; slug?: string[] }> },
): Promise<Response> {
  const { lang, slug } = await context.params;
  const page = isLocale(lang) ? source.getPage(slug, lang) : undefined;
  if (!page) return new Response(null, { status: 404 });

  const markdown = await page.data.getText("processed");
  const description = page.data.description ? `\n${page.data.description}\n` : "";
  const body = `# ${page.data.title}\n${description}\n${markdown}`;

  return new Response(body, {
    headers: { "Content-Type": "text/markdown; charset=utf-8" },
  });
}
