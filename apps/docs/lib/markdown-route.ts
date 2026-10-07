import { i18n, isLocale } from "@/lib/i18n";

export const MARKDOWN_SUFFIX = ".md";
const MARKDOWN_TYPE = "text/markdown";
const DOCS_PATH = /^(?:\/([a-z]{2}))?\/docs((?:\/[^/]+)*)$/;

export function markdownUrl(pageUrl: string): string {
  return `${pageUrl}${MARKDOWN_SUFFIX}`;
}

function mediaRange(part: string): { type: string; q: number } {
  const [type = "", ...params] = part.split(";").map((piece) => piece.trim().toLowerCase());
  const qParam = params.find((param) => param.startsWith("q="));
  const q = qParam === undefined ? 1 : Number.parseFloat(qParam.slice(2));
  return { type, q: Number.isNaN(q) ? 0 : q };
}

export function prefersMarkdown(accept: string | null): boolean {
  if (accept === null) return false;
  const ranges = accept.split(",").map(mediaRange);
  const markdown = ranges.find((range) => range.type === MARKDOWN_TYPE);
  if (markdown === undefined || markdown.q === 0) return false;
  const html = ranges.find((range) => range.type === "text/html");
  return html === undefined || markdown.q > html.q;
}

export function isDocsPath(pathname: string): boolean {
  const bare = pathname.endsWith(MARKDOWN_SUFFIX)
    ? pathname.slice(0, -MARKDOWN_SUFFIX.length)
    : pathname;
  const match = DOCS_PATH.exec(bare);
  return match !== null && (match[1] === undefined || isLocale(match[1]));
}

export function markdownRewritePath(pathname: string, accept: string | null): string | null {
  const explicit = pathname.endsWith(MARKDOWN_SUFFIX);
  if (!explicit && !prefersMarkdown(accept)) return null;
  const bare = explicit ? pathname.slice(0, -MARKDOWN_SUFFIX.length) : pathname;
  const match = DOCS_PATH.exec(bare);
  if (match === null) return null;
  const [, lang = i18n.defaultLanguage, slug = ""] = match;
  if (!isLocale(lang)) return null;
  return `/${lang}/docs.mdx${slug}`;
}
