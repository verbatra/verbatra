import { createTsdownConfig } from "@verbatra/config/tsdown";

export default createTsdownConfig({
  entry: ["src/index.ts", "src/bin.ts"],
  format: ["esm"],
  dts: { entry: "src/index.ts" },
  banner: { js: "#!/usr/bin/env node" },
});
