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
];
