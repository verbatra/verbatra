import "server-only";
import { loadBuiltScriptHashes } from "@/lib/csp-script-hashes";
import { hasMarkdownVariant, MARKDOWN_SUFFIX, markdownRewritePath } from "@/lib/markdown-route";
import { servedPathOf } from "@/lib/relay-path";
import type { ScriptHashesByRoute } from "@/lib/script-hashes-manifest.mjs";
import { isDocumentNavigation, isPageRoute, isRedirect } from "@/lib/server-pageview";
import type { UmamiEventSpec } from "@/lib/umami-event";

const DOCS_AREA = /^\/[^/]+\/docs(\/|$)/;
const NOT_FOUND_URL = { docs: "/docs", other: "/" } as const;
const HOME_MARKDOWN = "/index";

function pageOfMarkdown(pathname: string): string {
  const page = pathname.endsWith(MARKDOWN_SUFFIX)
    ? pathname.slice(0, -MARKDOWN_SUFFIX.length)
    : pathname;
  if (!page.endsWith(HOME_MARKDOWN)) return page;
  return page.slice(0, -HOME_MARKDOWN.length) || "/";
}

function markdownViewOf(
  request: Request,
  response: Response,
  routes: ScriptHashesByRoute,
): UmamiEventSpec | undefined {
  const { pathname } = new URL(request.url);
  if (request.method !== "GET" || isRedirect(response) || !hasMarkdownVariant(pathname)) {
    return undefined;
  }
  if (markdownRewritePath(pathname, request.headers.get("accept")) === null) return undefined;
  if (!isPageRoute(servedPathOf(pageOfMarkdown(pathname)), routes)) return undefined;
  const via = pathname.endsWith(MARKDOWN_SUFFIX) ? "suffix" : "accept";
  return { url: pathname, name: "markdown_view", data: { via } };
}

function notFoundOf(
  request: Request,
  response: Response,
  servedPathname: string,
  routes: ScriptHashesByRoute,
): UmamiEventSpec | undefined {
  const { pathname } = new URL(request.url);
  if (!isDocumentNavigation(request, response) || pathname.endsWith(MARKDOWN_SUFFIX)) {
    return undefined;
  }
  if (Object.keys(routes).length === 0 || isPageRoute(servedPathname, routes)) return undefined;
  const area = DOCS_AREA.test(servedPathname) ? "docs" : "other";
  return { url: NOT_FOUND_URL[area], name: "not_found", data: { area } };
}

export function proxyEventFor(
  request: Request,
  response: Response,
  servedPathname: string,
  routes: ScriptHashesByRoute = loadBuiltScriptHashes(),
): UmamiEventSpec | undefined {
  return (
    markdownViewOf(request, response, routes) ??
    notFoundOf(request, response, servedPathname, routes)
  );
}
