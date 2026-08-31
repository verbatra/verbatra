import { createTsupConfig } from "@verbatra/config/tsup";

export default createTsupConfig({
  entry: ["src/index.ts", "src/bin.ts"],
  format: ["esm"],
  dts: { entry: "src/index.ts" },
  banner: { js: "#!/usr/bin/env node" },
});
