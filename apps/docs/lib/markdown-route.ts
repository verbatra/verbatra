import { i18n, isLocale } from "@/lib/i18n";

export const MARKDOWN_SUFFIX = ".md";
const MARKDOWN_TYPE = "text/markdown";
const DOCS_PATH = /^(?:\/([a-z]{2}))?\/docs((?:\/[^/]+)*)$/;
const PAGE_PATH = /^(?:\/([a-z]{2}))?(\/[a-z-]+)$/;

export const MARKDOWN_PAGES: ReadonlyArray<string> = ["/compare"];

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

function withoutMarkdownSuffix(pathname: string): string {
  return pathname.endsWith(MARKDOWN_SUFFIX) ? pathname.slice(0, -MARKDOWN_SUFFIX.length) : pathname;
}

export function isDocsPath(pathname: string): boolean {
  const match = DOCS_PATH.exec(withoutMarkdownSuffix(pathname));
  return match !== null && (match[1] === undefined || isLocale(match[1]));
}

function markdownTarget(bare: string): string | null {
  const docs = DOCS_PATH.exec(bare);
  if (docs !== null) {
    const [, lang = i18n.defaultLanguage, slug = ""] = docs;
    return isLocale(lang) ? `/${lang}/docs.mdx${slug}` : null;
  }
  const page = PAGE_PATH.exec(bare);
  if (page === null) return null;
  const [, lang = i18n.defaultLanguage, path = ""] = page;
  return isLocale(lang) && MARKDOWN_PAGES.includes(path) ? `/${lang}${path}.mdx` : null;
}

export function hasMarkdownVariant(pathname: string): boolean {
  return markdownTarget(withoutMarkdownSuffix(pathname)) !== null;
}

export function markdownRewritePath(pathname: string, accept: string | null): string | null {
  const explicit = pathname.endsWith(MARKDOWN_SUFFIX);
  if (!explicit && !prefersMarkdown(accept)) return null;
  return markdownTarget(withoutMarkdownSuffix(pathname));
}
