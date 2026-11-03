import { createVitestConfig } from "@verbatra/config/vitest";

export default createVitestConfig({
  testInclude: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  coverageInclude: ["src/**/*.ts", "src/**/*.tsx"],
  coverageExclude: ["src/**/*.test.tsx", "src/test-support.tsx"],
});
