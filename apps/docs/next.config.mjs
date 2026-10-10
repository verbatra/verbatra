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

const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  outputFileTracingIncludes: {
    "/*": ["../../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*"],
    "/[lang]/home-og": ["./assets/og-fonts/*.ttf"],
  },
  experimental: {
    optimizePackageImports: ["@icons-pack/react-simple-icons"],
    optimisticRouting: false,
  },
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.verbatra.kreitz-webdev.de" }],
        destination: "https://verbatra.kreitz-webdev.de/:path*",
        permanent: true,
      },
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
