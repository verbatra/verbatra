/**
 * @param {import("./vitest.base.d.mts").CreateVitestConfigOptions} [options]
 * @returns {import("vitest/config").ViteUserConfig}
 */
export function createVitestConfig(options = {}) {
  const {
    testInclude = ["src/**/*.test.ts"],
    coverageInclude = ["src/**/*.ts"],
    coverageExclude = [],
    testTimeout = 60_000,
  } = options;

  return {
    test: {
      include: testInclude,
      testTimeout,
      coverage: {
        provider: "v8",
        reporter: ["text", "lcov"],
        include: coverageInclude,
        exclude: ["src/**/*.test.ts", "src/index.ts", "src/**/types.ts", ...coverageExclude],
        thresholds: { lines: 90, functions: 90, statements: 90, branches: 90 },
      },
    },
  };
}
