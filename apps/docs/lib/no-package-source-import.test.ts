import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROOT, appCodeFiles, importSpecifiers } from "@/test-support/app-sources";

const PACKAGE_SOURCE = /(^|\/)packages\/[^/]+\/src(\/|$)/;
const TEST_SUPPORT = /(^|\/)test-support(\/|$)/;
const TEST_FILE = /\.(test|spec)\.[cm]?[jt]sx?$/;

function packageSourceImports(source: string): string[] {
  return importSpecifiers(source).filter(
    (specifier) => PACKAGE_SOURCE.test(specifier) || TEST_SUPPORT.test(specifier),
  );
}

describe("shipping app code never imports another package's source", () => {
  it("detects the import shapes it guards against and ignores URLs", () => {
    const probe = [
      `import { run } from "../../../packages/cli/src/run";`,
      `import type { Session } from "../../../packages/cli/src/types";`,
      `const m = await import("../../packages/mcp/src/tools/registry");`,
      `export * from "../../../packages/studio/src/client/coverage";`,
      `import { runCli } from "@/test-support/run-fixture";`,
      `const c = await import(/* webpackChunkName: "cli" */ "../../../packages/cli/src/run");`,
    ].join("\n");
    expect(packageSourceImports(probe)).toHaveLength(6);
    const nonImport = [
      `const url = "https://github.com/verbatra/verbatra/blob/main/packages/sdk/src/config/provider-billing.ts";`,
      `import { check } from "@verbatra/sdk";`,
    ].join("\n");
    expect(packageSourceImports(nonImport)).toEqual([]);
  });

  it("does not count an import written inside a string or a comment", () => {
    const examples = [
      `export const example = 'import { run } from "../../../packages/cli/src/run";';`,
      `// import { run } from "../../../packages/cli/src/run";`,
      `/* import "../../../packages/cli/src/run"; */`,
    ].join("\n");
    expect(packageSourceImports(examples)).toEqual([]);
  });

  it("no non-test app file imports a packages/<name>/src path or test-support/", () => {
    const offenders = appCodeFiles()
      .filter((file) => !TEST_FILE.test(file))
      .filter((file) => packageSourceImports(readFileSync(file, "utf8")).length > 0)
      .map((file) => relative(APP_ROOT, file));
    expect(offenders).toEqual([]);
  });
});
