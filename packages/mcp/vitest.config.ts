import { createVitestConfig } from "@verbatra/config/vitest";

export default createVitestConfig({
  coverageExclude: ["src/bin.ts", "src/test-support.ts"],
});
