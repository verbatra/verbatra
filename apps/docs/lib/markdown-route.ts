import { i18n, isLocale, type Locale, landingLocale, localizedPath } from "@/lib/i18n";

export const MARKDOWN_SUFFIX = ".md";
const MARKDOWN_TYPE = "text/markdown";
const DOCS_PATH = /^(?:\/([a-z]{2}))?\/docs((?:\/[^/]+)*)$/;
const PAGE_PATH = /^(?:\/([a-z]{2}))?(\/[a-z-]+)$/;
const HOME_MARKDOWN_PATH = /^(?:\/([a-z]{2}))?\/index$/;
const HOME_SLUG = "index";
const SITE_MARKDOWN_SEGMENT = "site.mdx";
const INTERNAL_DOCS_PATH = /^(?:\/([a-z]{2}))?\/docs\.mdx((?:\/[^/]+)*)$/;
const INTERNAL_SITE_PATH = /^(?:\/([a-z]{2}))?\/site\.mdx\/([a-z-]+)$/;
const MDX_PATH = /\.mdx(?:\/|$)/;
const MDX_SUFFIX = ".mdx";

export const HOME_PATH = "/";

export const MARKDOWN_PAGES = [
  "/compare",
  "/imprint",
  "/privacy",
  "/licenses",
  "/contact",
] as const;

export type MarkdownPage = typeof HOME_PATH | (typeof MARKDOWN_PAGES)[number];

export const SITE_MARKDOWN_PAGES: ReadonlyArray<MarkdownPage> = [HOME_PATH, ...MARKDOWN_PAGES];

export function siteMarkdownSlug(page: MarkdownPage): string {
  return page === HOME_PATH ? HOME_SLUG : page.slice(1);
}

export function siteMarkdownPage(slug: string): MarkdownPage | null {
  return SITE_MARKDOWN_PAGES.find((page) => siteMarkdownSlug(page) === slug) ?? null;
}

export function markdownUrl(pageUrl: string): string {
  if (landingLocale(pageUrl) !== null) {
    return `${pageUrl === HOME_PATH ? "" : pageUrl}/${HOME_SLUG}${MARKDOWN_SUFFIX}`;
  }
  return `${pageUrl}${MARKDOWN_SUFFIX}`;
}

export function siteMarkdownUrl(locale: Locale, page: MarkdownPage): string {
  return markdownUrl(
    page === HOME_PATH && locale !== i18n.defaultLanguage
      ? `/${locale}`
      : localizedPath(locale, page),
  );
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

function siteTarget(lang: string, page: MarkdownPage): string | null {
  return isLocale(lang) ? `/${lang}/${SITE_MARKDOWN_SEGMENT}/${siteMarkdownSlug(page)}` : null;
}

function homeLocale(pathname: string, explicit: boolean): string | null {
  if (!explicit) return landingLocale(pathname);
  const home = HOME_MARKDOWN_PATH.exec(withoutMarkdownSuffix(pathname));
  return home === null ? null : (home[1] ?? i18n.defaultLanguage);
}

function markdownTarget(pathname: string, explicit: boolean): string | null {
  const home = homeLocale(pathname, explicit);
  if (home !== null) return siteTarget(home, HOME_PATH);
  const bare = withoutMarkdownSuffix(pathname);
  const docs = DOCS_PATH.exec(bare);
  if (docs !== null) {
    const [, lang = i18n.defaultLanguage, slug = ""] = docs;
    return isLocale(lang) ? `/${lang}/docs.mdx${slug}` : null;
  }
  const page = PAGE_PATH.exec(bare);
  if (page === null) return null;
  const [, lang = i18n.defaultLanguage, path = ""] = page;
  const listed = MARKDOWN_PAGES.find((candidate) => candidate === path);
  return listed === undefined ? null : siteTarget(lang, listed);
}

export function hasMarkdownVariant(pathname: string): boolean {
  return markdownTarget(pathname, pathname.endsWith(MARKDOWN_SUFFIX)) !== null;
}

export function markdownRewritePath(pathname: string, accept: string | null): string | null {
  const explicit = pathname.endsWith(MARKDOWN_SUFFIX);
  if (!explicit && !prefersMarkdown(accept)) return null;
  return markdownTarget(pathname, explicit);
}

export function isMdxPath(pathname: string): boolean {
  return MDX_PATH.test(pathname);
}

function localePrefix(lang: string | undefined): string | null {
  if (lang === undefined) return "";
  if (!isLocale(lang)) return null;
  return lang === i18n.defaultLanguage ? "" : `/${lang}`;
}

function publicCandidate(pathname: string): string | null {
  const docs = INTERNAL_DOCS_PATH.exec(pathname);
  if (docs !== null) {
    const prefix = localePrefix(docs[1]);
    return prefix === null ? null : `${prefix}/docs${docs[2] ?? ""}${MARKDOWN_SUFFIX}`;
  }
  const site = INTERNAL_SITE_PATH.exec(pathname);
  if (site !== null) {
    const prefix = localePrefix(site[1]);
    return prefix === null ? null : `${prefix}/${site[2] ?? ""}${MARKDOWN_SUFFIX}`;
  }
  return pathname.endsWith(MDX_SUFFIX)
    ? `${pathname.slice(0, -MDX_SUFFIX.length)}${MARKDOWN_SUFFIX}`
    : null;
}

export function mdxRedirectPath(pathname: string): string | null {
  const candidate = publicCandidate(pathname);
  return candidate !== null && hasMarkdownVariant(candidate) ? candidate : null;
}
