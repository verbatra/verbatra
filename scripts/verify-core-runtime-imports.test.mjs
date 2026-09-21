import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORE_ROOT = join(REPO_ROOT, "packages/core");
const CORE_SOURCE = join(CORE_ROOT, "src");

const STATIC_SPECIFIER = /(?:^|[\s;}])(?:import|export)\s[^"'`;]*?\sfrom\s*["']([^"']+)["']/g;
const BARE_IMPORT = /(?:^|[\s;}])import\s*["']([^"']+)["']/g;
const DYNAMIC_SPECIFIER = /\bimport\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;
const DYNAMIC_EXPRESSION = /\bimport\s*\(\s*(?!["'`][^"'`]+["'`]\s*\))/;

function runtimeSourceFiles(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      runtimeSourceFiles(path, out);
    } else if (/\.[cm]?tsx?$/.test(entry.name) && !/\.test\.[cm]?tsx?$/.test(entry.name)) {
      out.push(path);
    }
  }
  return out;
}

function specifiersIn(source) {
  const specifiers = [];
  for (const pattern of [STATIC_SPECIFIER, BARE_IMPORT, DYNAMIC_SPECIFIER]) {
    for (const match of source.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }
  if (DYNAMIC_EXPRESSION.test(source)) {
    specifiers.push("<computed dynamic import>");
  }
  return specifiers;
}

function isAllowedRuntimeSpecifier(specifier) {
  return specifier === "zod" || specifier.startsWith("./") || specifier.startsWith("../");
}

function disallowedSpecifiers(source) {
  return specifiersIn(source).filter((specifier) => !isAllowedRuntimeSpecifier(specifier));
}

describe("@verbatra/core runtime code imports only zod and its own modules", () => {
  const files = runtimeSourceFiles(CORE_SOURCE);

  it("scans a non-trivial set of runtime source files", () => {
    expect(files.length).toBeGreaterThanOrEqual(10);
  });

  it("finds no other package imported by a non-test source file", () => {
    const offenders = files.flatMap((path) =>
      disallowedSpecifiers(readFileSync(path, "utf8")).map(
        (specifier) => `${relative(REPO_ROOT, path)}: ${specifier}`,
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("declares zod as its only runtime dependency", () => {
    const manifest = JSON.parse(readFileSync(join(CORE_ROOT, "package.json"), "utf8"));
    expect(Object.keys(manifest.dependencies ?? {})).toEqual(["zod"]);
  });

  it.each([
    ['import { parseFragment } from "parse5";', "parse5"],
    ['import type { Element } from "parse5";', "parse5"],
    ['export { x } from "node:fs";', "node:fs"],
    ['import "parse5";', "parse5"],
    ['const p = await import("parse5");', "parse5"],
    ["const p = await import(`parse5`);", "parse5"],
    ["const p = await import(name);", "<computed dynamic import>"],
    ['import {\n  a,\n  b,\n} from "entities";', "entities"],
  ])("flags %j", (source, specifier) => {
    expect(disallowedSpecifiers(source)).toEqual([specifier]);
  });

  it.each([
    'import { z } from "zod";',
    'import { scanMarkup } from "./markup-scanner.js";',
    'export { checkPlaceholders } from "./placeholder/integrity.js";',
    'import type { InlineTag } from "../placeholder/markup-scanner.js";',
    'const text = "import from parse5";',
  ])("allows %j", (source) => {
    expect(disallowedSpecifiers(source)).toEqual([]);
  });
});
