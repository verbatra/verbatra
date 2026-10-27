import type { KnipConfig } from "knip";

const config: KnipConfig = {
  ignoreExportsUsedInFile: true,

  ignoreBinaries: ["jq"],

  workspaces: {
    ".": {
      entry: ["scripts/*.mjs", "scripts/dts-fixture/*consumer.{ts,cts}"],
      project: ["scripts/**/*.{mjs,ts}"],
    },

    "apps/docs": {
      entry: ["verbatra.config.ts"],
      playwright: {
        config: ["playwright.config.ts"],
        entry: ["e2e/**/*.spec.ts"],
      },
      ignoreDependencies: ["@verbatra/studio"],
      ignoreFiles: [
        "lib/inline-script-hashes.d.mts",
        "lib/script-hashes-manifest.d.mts",
        "lib/security-headers.d.mts",
        "lib/standalone-output.d.mts",
      ],
    },

    "packages/sdk": {
      ignoreDependencies: [
        "@formatjs/icu-messageformat-parser",
        "@google/genai",
        "@xmldom/xmldom",
        "deepl-node",
        "jszip",
        "loglevel",
        "yaml",
      ],
    },

    "packages/studio": {
      entry: ["src/shared/rpc/*.ts"],
    },

    e2e: {
      project: ["src/**/*.ts", "tests/**/*.ts"],
    },
  },
};

export default config;
