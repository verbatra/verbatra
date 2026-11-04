import { createVitestConfig } from "@verbatra/config/vitest";

const base = createVitestConfig({
  testInclude: [
    "*.test.ts",
    "src/server/**/*.test.ts",
    "src/client/**/*.test.ts",
    "src/shared/**/*.test.ts",
    "src/webmcp/**/*.test.ts",
    "src/app/**/*.test.tsx",
  ],
  coverageInclude: [
    "src/server/**/*.ts",
    "src/client/**/*.ts",
    "src/shared/**/*.ts",
    "src/webmcp/**/*.ts",
    "src/app/**/*.ts",
    "src/app/**/*.tsx",
  ],
  coverageExclude: [
    "src/**/*.test.tsx",
    "src/app/test-support.tsx",
    "src/app/main.tsx",
    "src/app/panel-props.ts",
    "src/app/css.d.ts",
  ],
});

const config: ReturnType<typeof createVitestConfig> = {
  ...base,
  test: { ...base.test, setupFiles: ["./vitest.setup.ts"] },
};

export default config;
