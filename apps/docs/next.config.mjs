import path from "node:path";
import { createMDX } from "fumadocs-mdx/next";
import createNextIntlPlugin from "next-intl/plugin";
import { securityHeaders } from "./lib/security-headers.mjs";

export const MOVED_DOCS_PAGES = {
  testing: "translation-safety",
  "your-first-translation": "quickstart",
};

function movedDocsPageRedirects(from, to) {
  return ["", ".md"].flatMap((suffix) => [
    { source: `/docs/${from}${suffix}`, destination: `/docs/${to}${suffix}`, permanent: true },
    {
      source: `/:locale(de|es|fr)/docs/${from}${suffix}`,
      destination: `/:locale/docs/${to}${suffix}`,
      permanent: true,
    },
  ]);
}

export const DEFAULT_LOCALE_PREFIX_REDIRECTS = [
  { source: "/en", destination: "/", permanent: true },
  { source: "/en/:path+", destination: "/:path+", permanent: true },
];

const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  outputFileTracingIncludes: {
    "/*": ["../../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*"],
    "/[lang]/home-og": ["./assets/og-fonts/*.ttf"],
    "/[lang]/compare-og": ["./assets/og-fonts/*.ttf"],
    "/[lang]/docs-og/[[...slug]]": ["./assets/og-fonts/*.ttf"],
  },
  experimental: {
    agentUpgrade: "security",
    optimisticRouting: false,
    globalNotFound: true,
    turbopackChunking: { minChunkSize: 200000, requestCost: 1000000 },
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.verbatra.kreitz-webdev.de" }],
        destination: "https://verbatra.kreitz-webdev.de/:path*",
        permanent: true,
      },
      ...DEFAULT_LOCALE_PREFIX_REDIRECTS,
      ...Object.entries(MOVED_DOCS_PAGES).flatMap(([from, to]) => movedDocsPageRedirects(from, to)),
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders(),
      },
    ];
  },
};

const withMDX = createMDX();

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(withMDX(config));
