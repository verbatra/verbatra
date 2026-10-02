import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    server: {
      deps: {
        inline: ["fumadocs-core"],
      },
    },
    include: [
      "lib/**/*.test.ts",
      "lib/**/*.test.tsx",
      "components/**/*.test.tsx",
      "app/**/*.test.ts",
      "app/**/*.test.tsx",
      "proxy.test.ts",
      "proxy.cookies.test.ts",
      "next.config.test.ts",
    ],
  },
});
