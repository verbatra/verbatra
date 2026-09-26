import { createI18nMiddleware } from "fumadocs-core/i18n/middleware";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { i18n } from "@/lib/i18n";
import { isDocsPath, markdownRewritePath } from "@/lib/markdown-route";

const NEXT_ACTION_HEADER = "next-action";
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

export default async function proxy(request: NextRequest, event: NextFetchEvent) {
  if (request.headers.has(NEXT_ACTION_HEADER)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const { pathname } = request.nextUrl;
  if (!isDocsPath(pathname)) return i18nProxyWithoutCookies(request, event);
  const markdownPath = markdownRewritePath(pathname, request.headers.get("accept"));
  if (markdownPath !== null) {
    return varyOnAccept(NextResponse.rewrite(new URL(markdownPath, request.url)));
  }
  const response = await i18nProxyWithoutCookies(request, event);
  return response instanceof Response ? varyOnAccept(response) : response;
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms.txt|llms-full.txt|\\.well-known|.*\\.(?:png|jpg|jpeg|webp|avif|gif|ico|svg|webmanifest)$).*)",
  ],
};
