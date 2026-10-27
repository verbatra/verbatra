import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROOT, appCodeFiles } from "@/test-support/app-sources";

const SCRIPTS = ["scr", "ipts"].join("");
const SPECIFIER =
  /(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s+|\brequire\s*\(\s*|\brequire\.resolve\s*\(\s*|\bexport\s+\*\s+from\s*)["'`]([^"'`]+)["'`]/g;

function scriptImports(source: string): string[] {
  return [...source.matchAll(SPECIFIER)]
    .map(([, specifier]) => specifier ?? "")
    .filter((specifier) => /(^|\/)scripts(\/|$)/.test(specifier));
}

describe("app code never imports scripts/", () => {
  it("detects the import shapes it guards against", () => {
    const probe = [
      `import { x } from "../${SCRIPTS}/playground/run.ts";`,
      `import "@/${SCRIPTS}/playground/source";`,
      `const m = await import("../../${SCRIPTS}/sync-version.mjs");`,
      `export * from "../${SCRIPTS}/playground/guards";`,
      `const r = require("./${SCRIPTS}/playground/limits");`,
      `const p = require.resolve('./${SCRIPTS}/playground/limits');`,
      `const t = require(\`./${SCRIPTS}/playground/source\`);`,
    ].join("\n");
    expect(scriptImports(probe)).toHaveLength(7);
    const nonImport = `import { z } from "zod";\nconst u = new URL("../${SCRIPTS}/x.json", import.meta.url);`;
    expect(scriptImports(nonImport)).toEqual([]);
  });

  it("scans the app-root sources that ship as well as app/, components/, lib/ and i18n/", () => {
    const scanned = appCodeFiles().map((file) => relative(APP_ROOT, file));
    for (const file of [
      "proxy.ts",
      "instrumentation.ts",
      "next.config.mjs",
      "source.config.ts",
      "i18n/request.ts",
    ]) {
      expect(scanned).toContain(file);
    }
    expect(scanned.some((file) => file.startsWith(SCRIPTS))).toBe(false);
  });

  it("no app file imports scripts/", () => {
    const offenders = appCodeFiles()
      .filter((file) => scriptImports(readFileSync(file, "utf8")).length > 0)
      .map((file) => relative(APP_ROOT, file));
    expect(offenders).toEqual([]);
  });
});
