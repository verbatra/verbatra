import path from "node:path";
import { createMDX } from "fumadocs-mdx/next";
import createNextIntlPlugin from "next-intl/plugin";
import { securityHeaders } from "./lib/security-headers.mjs";

const config = {
  reactStrictMode: true,
  poweredByHeader: false,
  output: "standalone",
  outputFileTracingRoot: path.join(import.meta.dirname, "../.."),
  outputFileTracingIncludes: {
    "/*": ["../../node_modules/.pnpm/@swc+helpers@*/node_modules/@swc/helpers/esm/**/*"],
  },
  experimental: {
    optimizePackageImports: ["@icons-pack/react-simple-icons", "motion"],
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
      {
        source: "/docs/testing",
        destination: "/docs/translation-safety",
        permanent: true,
      },
      {
        source: "/:locale(de|es|fr)/docs/testing",
        destination: "/:locale/docs/translation-safety",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({ isDev: process.env.NODE_ENV === "development" }),
      },
    ];
  },
};

const withMDX = createMDX();

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

export default withNextIntl(withMDX(config));
