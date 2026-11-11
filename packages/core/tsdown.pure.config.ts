import { createTsdownConfig } from "@verbatra/config/tsdown";

export default createTsdownConfig({
  entry: ["src/pure.ts"],
  clean: false,
});
