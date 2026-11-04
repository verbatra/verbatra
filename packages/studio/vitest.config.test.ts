import { describe, expect, it } from "vitest";
import studioVitestConfig from "./vitest.config.ts";

const presetExcludes = ["src/**/*.test.ts", "src/index.ts", "src/**/types.ts"];

const presetThresholds = { lines: 90, functions: 90, statements: 90, branches: 90 };

const { include: testInclude, coverage } = studioVitestConfig.test ?? {};

describe("the studio vitest config", () => {
  it("runs the setup file that stubs the browser APIs jsdom lacks", () => {
    expect(studioVitestConfig.test?.setupFiles).toEqual(["./vitest.setup.ts"]);
  });

  it("discovers the tests of every non-React source tree", () => {
    expect(testInclude).toContain("src/server/**/*.test.ts");
    expect(testInclude).toContain("src/client/**/*.test.ts");
    expect(testInclude).toContain("src/shared/**/*.test.ts");
    expect(testInclude).toContain("src/webmcp/**/*.test.ts");
  });

  it("discovers the React layer's tests, which are .test.tsx rather than .test.ts", () => {
    expect(testInclude).toContain("src/app/**/*.test.tsx");
  });

  it("discovers this file, so the config it pins cannot drop its own guard", () => {
    expect(testInclude).toContain("*.test.ts");
  });

  it("measures every non-React source tree", () => {
    expect(coverage?.include).toContain("src/server/**/*.ts");
    expect(coverage?.include).toContain("src/client/**/*.ts");
    expect(coverage?.include).toContain("src/shared/**/*.ts");
    expect(coverage?.include).toContain("src/webmcp/**/*.ts");
  });

  it("measures the React layer, both its .ts modules and its .tsx components", () => {
    expect(coverage?.include).toContain("src/app/**/*.ts");
    expect(coverage?.include).toContain("src/app/**/*.tsx");
  });

  it("excludes the React layer's own test files from the measured sources", () => {
    expect(coverage?.exclude).toContain("src/**/*.test.tsx");
  });

  it("leaves unmeasured exactly the files listed here and nothing else", () => {
    expect(coverage?.exclude).toEqual([
      ...presetExcludes,
      "src/**/*.test.tsx",
      "src/app/test-support.tsx",
      "src/app/main.tsx",
      "src/app/panel-props.ts",
      "src/app/css.d.ts",
    ]);
  });

  it("goes through the shared createVitestConfig preset", () => {
    expect(coverage?.provider).toBe("v8");
    expect(coverage?.reporter).toEqual(["text", "lcov"]);
    expect(coverage?.exclude?.slice(0, presetExcludes.length)).toEqual(presetExcludes);
  });

  it("inherits the shared coverage thresholds instead of overriding them", () => {
    expect(coverage?.thresholds).toEqual(presetThresholds);
  });
});
