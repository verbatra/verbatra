import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
      "server-only": fileURLToPath(new URL("node_modules/server-only/empty.js", import.meta.url)),
    },
  },
  test: {
    server: {
      deps: {
        inline: ["fumadocs-core", "fumadocs-mdx", "@verbatra/sdk"],
      },
    },
    include: [
      "lib/**/*.test.ts",
      "lib/**/*.test.tsx",
      "components/**/*.test.tsx",
      "app/**/*.test.ts",
      "app/**/*.test.tsx",
      "proxy.test.ts",
      "instrumentation.test.ts",
      "proxy.cookies.test.ts",
      "proxy.csp.test.ts",
      "proxy.pageview.test.ts",
      "next.config.test.ts",
      "scripts/playground/**/*.test.ts",
    ],
  },
});
