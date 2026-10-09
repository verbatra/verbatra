import { createTsupConfig } from "@verbatra/config/tsup";

export default createTsupConfig({
  entry: ["src/pure.ts"],
  clean: false,
});
