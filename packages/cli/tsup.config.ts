import { createTsupConfig } from "@verbatra/config/tsup";

export default [
  createTsupConfig({
    entry: ["src/index.ts"],
    format: ["esm"],
    dts: false,
    clean: ["!lib.*"],
    banner: { js: "#!/usr/bin/env node" },
    external: ["@verbatra/studio", "@verbatra/mcp"],
  }),
  createTsupConfig({
    entry: ["src/lib.ts"],
    format: ["esm", "cjs"],
    clean: false,
  }),
  createTsupConfig({
    entry: { "json-envelope-schema": "src/json-envelope-schema.ts" },
    format: ["esm"],
    dts: false,
    sourcemap: false,
    clean: true,
    outDir: "node_modules/.cache/verbatra-cli-schemas",
  }),
];
