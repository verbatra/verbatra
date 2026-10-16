import { createI18nMiddleware } from "fumadocs-core/i18n/middleware";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { scriptHashesFor } from "@/lib/csp-script-hashes";
import { i18n } from "@/lib/i18n";
import {
  hasMarkdownVariant,
  isMdxPath,
  markdownRewritePath,
  mdxRedirectPath,
} from "@/lib/markdown-route";
import { requestHost } from "@/lib/request-host";
import {
  CSP_ENFORCED,
  contentSecurityPolicy,
  upgradesInsecureRequests,
} from "@/lib/security-headers.mjs";
import { countedPageview, sendPageview } from "@/lib/server-pageview";

const NEXT_ACTION_HEADER = "next-action";
const REWRITE_HEADER = "x-middleware-rewrite";
const i18nProxy = createI18nMiddleware(i18n);

async function i18nProxyWithoutCookies(request: NextRequest, event: NextFetchEvent) {
  const response = await i18nProxy(request, event);
  if (response instanceof Response) response.headers.delete("set-cookie");
  return response;
}

function varyOnAccept(response: Response): Response {
  response.headers.append("vary", "Accept");
  return response;
}

function servedPathname(request: NextRequest, response: Response): string {
  const rewrite = response.headers.get(REWRITE_HEADER);
  const pathname = rewrite === null ? request.nextUrl.pathname : new URL(rewrite).pathname;
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
}

function withContentSecurityPolicy(request: NextRequest, response: Response): Response {
  const isDev = process.env.NODE_ENV === "development";
  const { key, value } = contentSecurityPolicy({
    enforce: CSP_ENFORCED,
    isDev,
    scriptHashes: isDev ? [] : scriptHashesFor(servedPathname(request, response)),
    upgradeInsecureRequests: upgradesInsecureRequests(
      requestHost(request.headers, request.nextUrl.host),
    ),
  });
  response.headers.set(key, value);
  return response;
}

async function route(request: NextRequest, event: NextFetchEvent) {
  if (request.headers.has(NEXT_ACTION_HEADER)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { pathname } = request.nextUrl;
  if (isMdxPath(pathname)) {
    const target = mdxRedirectPath(pathname);
    if (target !== null) return NextResponse.redirect(new URL(target, request.url), 308);
  }
  if (!hasMarkdownVariant(pathname)) return i18nProxyWithoutCookies(request, event);
  const markdownPath = markdownRewritePath(pathname, request.headers.get("accept"));
  if (markdownPath !== null) {
    return varyOnAccept(NextResponse.rewrite(new URL(markdownPath, request.url)));
  }
  const response = await i18nProxyWithoutCookies(request, event);
  return response instanceof Response ? varyOnAccept(response) : response;
}

function countPageview(request: NextRequest, response: Response, event: NextFetchEvent): void {
  const pageview = countedPageview(request, response, servedPathname(request, response));
  if (pageview !== undefined) event.waitUntil(sendPageview(pageview));
}

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  const response = await route(request, event);
  if (!(response instanceof Response)) return response;
  countPageview(request, response, event);
  return withContentSecurityPolicy(request, response);
}

export const config = {
  matcher: [
    "/((?!api|schema/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms.txt|llms-full.txt|\\.well-known|.*\\.(?:png|jpg|jpeg|webp|avif|gif|ico|svg|webmanifest)$).*)",
  ],
};
