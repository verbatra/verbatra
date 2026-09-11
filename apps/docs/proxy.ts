import { createI18nMiddleware } from "fumadocs-core/i18n/middleware";
import type { NextFetchEvent, NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { i18n } from "@/lib/i18n";

const NEXT_ACTION_HEADER = "next-action";
const i18nProxy = createI18nMiddleware(i18n);

export default function proxy(request: NextRequest, event: NextFetchEvent) {
  if (request.headers.has(NEXT_ACTION_HEADER)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  return i18nProxy(request, event);
}

export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|llms.txt|llms-full.txt|\\.well-known|.*\\.(?:png|jpg|jpeg|webp|avif|gif|ico|svg|webmanifest)$).*)",
  ],
};
