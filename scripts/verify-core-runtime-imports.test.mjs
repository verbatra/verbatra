import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const CORE_ROOT = join(REPO_ROOT, "packages/core");
const CORE_SOURCE = join(CORE_ROOT, "src");
const PURE_ENTRY = join(CORE_SOURCE, "pure.ts");
const PURE_BUILDS = ["dist/pure.js", "dist/pure.cjs"];

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

const DOC_COMMENT = /^[ \t]*\/\*\*[\s\S]*?\*\//gm;

function specifiersIn(source) {
  const code = source.replace(DOC_COMMENT, "");
  const specifiers = [];
  for (const pattern of [STATIC_SPECIFIER, BARE_IMPORT, DYNAMIC_SPECIFIER]) {
    for (const match of code.matchAll(pattern)) {
      specifiers.push(match[1]);
    }
  }
  if (DYNAMIC_EXPRESSION.test(code)) {
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
    ['/** doc */\nimport x from "parse5";', "parse5"],
    ['const g = "src/**/*.ts";\nimport x from "parse5";\n/* */', "parse5"],
  ])("flags %j", (source, specifier) => {
    expect(disallowedSpecifiers(source)).toEqual([specifier]);
  });

  it.each([
    'import { z } from "zod";',
    'import { scanMarkup } from "./markup-scanner.js";',
    'export { checkPlaceholders } from "./placeholder/integrity.js";',
    'import type { InlineTag } from "../placeholder/markup-scanner.js";',
    'const text = "import from parse5";',
    '/**\n * @example\n * ```ts\n * import { isCustomFormatId } from "@verbatra/sdk";\n * ```\n */',
  ])("allows %j", (source) => {
    expect(disallowedSpecifiers(source)).toEqual([]);
  });
});

const TYPE_ONLY_STATEMENT =
  /(?:^|[\s;}])(?:import|export)\s+type\s[^;]*?\sfrom\s*["'][^"']+["']\s*;?/g;
const REQUIRE_SPECIFIER = /\brequire\s*\(\s*["'`]([^"'`]+)["'`]\s*\)/g;

function valueSpecifiersIn(source) {
  return specifiersIn(source.replace(DOC_COMMENT, "").replace(TYPE_ONLY_STATEMENT, ""));
}

function resolveRelative(fromFile, specifier) {
  return resolve(dirname(fromFile), specifier.replace(/\.js$/, ".ts"));
}

function runtimeGraph(entry) {
  const visited = new Set();
  const external = new Set();
  const pending = [entry];
  while (pending.length > 0) {
    const file = pending.pop();
    if (visited.has(file)) continue;
    visited.add(file);
    for (const specifier of valueSpecifiersIn(readFileSync(file, "utf8"))) {
      if (specifier.startsWith("./") || specifier.startsWith("../")) {
        pending.push(resolveRelative(file, specifier));
      } else {
        external.add(specifier);
      }
    }
  }
  return {
    files: [...visited].map((file) => relative(CORE_SOURCE, file)).sort(),
    external: [...external],
  };
}

function builtSpecifiers(code) {
  const specifiers = specifiersIn(code);
  for (const match of code.matchAll(REQUIRE_SPECIFIER)) {
    specifiers.push(match[1]);
  }
  return specifiers;
}

describe("@verbatra/core/pure never reaches zod", () => {
  it("is exported as its own subpath next to the unchanged root entry", () => {
    const manifest = JSON.parse(readFileSync(join(CORE_ROOT, "package.json"), "utf8"));
    expect(manifest.exports).toEqual({
      ".": { types: "./dist/index.d.ts", import: "./dist/index.js", require: "./dist/index.cjs" },
      "./pure": { types: "./dist/pure.d.ts", import: "./dist/pure.js", require: "./dist/pure.cjs" },
    });
  });

  it("imports no package at runtime anywhere in its source graph", () => {
    expect(runtimeGraph(PURE_ENTRY).external).toEqual([]);
  });

  it("walks the diff, hash and placeholder modules and no model schema", () => {
    const { files } = runtimeGraph(PURE_ENTRY);
    expect(files).toEqual(
      expect.arrayContaining([
        "diff/diff-resources.ts",
        "hash/content-hash.ts",
        "placeholder/integrity.ts",
      ]),
    );
    expect(files.filter((file) => file.startsWith("model/"))).toEqual([]);
  });

  it("follows value imports into a module that imports zod", () => {
    const graph = runtimeGraph(join(CORE_SOURCE, "model/locale-resource.ts"));
    expect(graph.external).toEqual(["zod"]);
  });

  it.each(PURE_BUILDS)("%s is self-contained and imports nothing", (build) => {
    const path = join(CORE_ROOT, build);
    expect(existsSync(path), `${build} is missing; run pnpm build first`).toBe(true);
    const code = readFileSync(path, "utf8");
    expect(builtSpecifiers(code)).toEqual([]);
    expect(code).not.toMatch(/\bzod\b/);
  });

  it.each([
    ['import { z } from "zod";', ["zod"]],
    ['const { z } = require("zod");', ["zod"]],
    ['import { x } from "./chunk-abc.js";', ["./chunk-abc.js"]],
  ])("reads the built specifiers of %j", (code, expected) => {
    expect(builtSpecifiers(code)).toEqual(expected);
  });

  it.each([
    ['import type { LocaleResource } from "../model/locale-resource.js";', []],
    ['export type { TranslationEntry } from "./model/translation-entry.js";', []],
    ['import { type TranslationEntry, value } from "./entry.js";', ["./entry.js"]],
  ])("treats %j as a runtime import only when it carries a value", (source, expected) => {
    expect(valueSpecifiersIn(source)).toEqual(expected);
  });
});
