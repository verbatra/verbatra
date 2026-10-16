import { compareMarkdown } from "@/lib/compare-markdown";
import { i18n, isLocale, localizedPath } from "@/lib/i18n";
import { COMPARE_PATH } from "@/lib/landing-compare";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-static";

export function generateStaticParams(): Array<{ lang: string }> {
  return i18n.languages.map((lang) => ({ lang }));
}

export async function GET(
  _request: Request,
  context: { params: Promise<{ lang: string }> },
): Promise<Response> {
  const { lang } = await context.params;
  if (!isLocale(lang)) return new Response(null, { status: 404 });
  const canonical = new URL(localizedPath(lang, COMPARE_PATH), SITE_URL).href;
  return new Response(`${await compareMarkdown(lang)}\n`, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      Link: `<${canonical}>; rel="canonical"`,
    },
  });
}
