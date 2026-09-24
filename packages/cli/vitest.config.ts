import { createVitestConfig } from "@verbatra/config/vitest";

export default createVitestConfig({
  coverageExclude: ["src/test-support.ts", "src/lib.ts"],
});
