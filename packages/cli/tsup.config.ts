import { createTsupConfig } from "@verbatra/config/tsup";

export default createTsupConfig({
  entry: ["src/index.ts", "src/lib.ts"],
  format: ["esm"],
  dts: { entry: "src/lib.ts" },
  banner: { js: "#!/usr/bin/env node" },
  external: ["@verbatra/studio", "@verbatra/mcp"],
});
