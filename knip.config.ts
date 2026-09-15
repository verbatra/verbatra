import type { KnipConfig } from "knip";

// Unused-file, unused-export and unused-dependency detection across the workspace. Every
// suppression below is a documented structural fact about this repository, not a convenience.
//
// Run it with `pnpm knip`. It is deliberately outside `pnpm verify` and outside ci.yml altogether,
// and runs from .github/workflows/knip.yml instead. verify is the merge gate and must stay
// deterministic, and release.yml fires on workflow_run for the "CI" workflow and publishes only
// when that run's conclusion is success, so any job in ci.yml can block a publish whether or not
// the gate job lists it. Nothing informational belongs on that path.
const config: KnipConfig = {
  // An export that its own module already uses is not dead code, only over-exported. The repo bans
  // JSDoc and prose comments on internal code, so knip's per-symbol comment tags are unavailable
  // and this boolean is the only granularity there is.
  ignoreExportsUsedInFile: true,

  // `printf` in the check:no-em-dash script is a shell builtin, not an installable binary.
  ignoreBinaries: ["printf"],

  workspaces: {
    ".": {
      // scripts/ holds the root guards that pnpm verify runs. The dts-fixture consumers are never
      // imported: check:dts compiles them against the built declarations as standalone consumers.
      entry: ["scripts/*.mjs", "scripts/dts-fixture/*consumer.ts"],
      project: ["scripts/**/*.{mjs,ts}"],
    },

    "apps/docs": {
      // Read at runtime by cosmiconfig when the docs site runs `verbatra translate`.
      entry: ["verbatra.config.ts"],
      // The CLI reaches the studio dashboard through a dynamic import, so no source file in the
      // docs app names the package. scripts/check-build-output.mjs guards that indirection.
      ignoreDependencies: ["@verbatra/studio"],
    },

    "packages/sdk": {
      // Runtime dependencies the sdk re-declares because tsup bundles the internal packages that
      // import them, as documented in pnpm-workspace.yaml's "bundled" catalog. They ship to
      // consumers and are load-bearing; knip cannot see through the bundle. Removing any of them
      // would break the published package and collide with scripts/check-dependency-changeset.mjs.
      //
      // This is every catalog:bundled entry no sdk source file imports directly, which is all of
      // them except exceljs. Listing all nine rather than only the ones a given run happens to
      // flag keeps the result the same with and without built output: on a tree that has
      // packages/*/dist, knip resolves the internal packages to their bundles and incidentally
      // sees three of these as used, and on a clean checkout it does not.
      ignoreDependencies: [
        "@anthropic-ai/sdk",
        "@formatjs/icu-messageformat-parser",
        "@google/genai",
        "@xmldom/xmldom",
        "deepl-node",
        "jszip",
        "loglevel",
        "openai",
        "yaml",
      ],
    },

    "packages/studio": {
      // src/shared/rpc is the wire contract between the server, the client, the app and the webmcp
      // surface. Each method module exports its name, its zod params schema, the inferred params
      // type and the result type as one unit, so the inferred half has no importer by design.
      // Entry keeps these files fully analyzed while treating their exports as the contract.
      entry: ["src/shared/rpc/*.ts"],
    },

    // e2e is not a pnpm workspace member: pnpm-workspace.yaml globs packages/* and apps/* only. It
    // has its own manifest and lockfile and installs the packed tarballs. Naming it here is what
    // stops its harness, its two vitest configs and its own devDependencies reading as unused.
    e2e: {
      project: ["src/**/*.ts", "tests/**/*.ts"],
    },
  },
};

export default config;
