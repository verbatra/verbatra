import { readFileSync } from "node:fs";
import { relative } from "node:path";
import { describe, expect, it } from "vitest";
import { APP_ROOT, appTextFiles } from "@/test-support/app-sources";

const FORBIDDEN = [
  ["generativelanguage", "googleapis", "com"].join("."),
  ["GEMINI", "PLAYGROUND", "API", "KEY"].join("_"),
];

describe("app code carries no playground provider details", () => {
  it("scans the app-root sources that ship as well as app/, components/, lib/ and i18n/", () => {
    const scanned = appTextFiles().map((file) => relative(APP_ROOT, file));
    for (const file of ["proxy.ts", "instrumentation.ts", "next.config.mjs", "source.config.ts"]) {
      expect(scanned).toContain(file);
    }
    expect(scanned).toContain("i18n/request.ts");
  });

  it("no app file names the Gemini API host or the playground key variable", () => {
    const offenders = appTextFiles().flatMap((file) => {
      const source = readFileSync(file, "utf8");
      return FORBIDDEN.filter((needle) => source.includes(needle)).map(
        (needle) => `${relative(APP_ROOT, file)}: ${needle}`,
      );
    });
    expect(offenders).toEqual([]);
  });
});
