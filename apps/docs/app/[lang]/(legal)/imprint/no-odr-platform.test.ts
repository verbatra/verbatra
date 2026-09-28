import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const DOCS_ROOT = fileURLToPath(new URL("../../../../", import.meta.url));
const SKIPPED_DIRS = new Set(["node_modules", ".next", ".source", ".turbo", "coverage"]);
const SCANNED_EXTENSIONS = [".ts", ".tsx", ".mdx", ".md", ".json", ".mjs", ".js"];
const RETIRED_ODR_PLATFORM = ["ec.europa.eu", "consumers", "odr"].join("/");

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return SKIPPED_DIRS.has(entry.name) ? [] : listSourceFiles(path);
    }
    return SCANNED_EXTENSIONS.some((ext) => entry.name.endsWith(ext)) ? [path] : [];
  });
}

describe("imprint: retired EU ODR platform", () => {
  it("is not referenced anywhere in the docs app", () => {
    const offenders = listSourceFiles(DOCS_ROOT)
      .filter((file) => readFileSync(file, "utf8").includes(RETIRED_ODR_PLATFORM))
      .map((file) => relative(DOCS_ROOT, file));
    expect(offenders).toEqual([]);
  });
});
