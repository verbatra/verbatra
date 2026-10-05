import { createVitestConfig } from "./vitest.base.mjs";

export default createVitestConfig({
  testInclude: ["*.test.mjs"],
  coverageInclude: ["vitest.base.mjs", "tsup.base.mjs", "scaling.base.mjs"],
});
