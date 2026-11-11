import { readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, relative, resolve, sep } from "node:path";
import { parseSync } from "oxc-parser";
import { describe, expect, it } from "vitest";

const SRC = resolve(import.meta.dirname, "..");
const BROWSER_DIRS = ["app", "client", "shared", "webmcp"];
const NODE_BUILTINS = new Set(builtinModules.flatMap((name) => [name, name.split("/")[0] ?? name]));
const BROWSER_SAFE_PACKAGES = new Set([
  "react",
  "react-dom",
  "zod",
  "clsx",
  "tailwind-merge",
  "@verbatra/ui",
]);

interface ModuleReference {
  readonly specifier: string;
  readonly typeOnly: boolean;
}

interface AstNode {
  readonly type: string;
  readonly [key: string]: unknown;
}

interface TemplateQuasi {
  readonly value: { readonly cooked: string };
}

function isNode(value: unknown): value is AstNode {
  return typeof value === "object" && value !== null && typeof (value as AstNode).type === "string";
}

function stringValue(node: unknown): string | undefined {
  if (!isNode(node)) {
    return undefined;
  }
  if (node.type === "Literal" && typeof node.value === "string") {
    return node.value;
  }
  const quasis = node.quasis;
  if (node.type === "TemplateLiteral" && Array.isArray(quasis) && quasis.length === 1) {
    return (quasis[0] as TemplateQuasi).value.cooked;
  }
  return undefined;
}

function declarationReference(node: AstNode): ModuleReference | undefined {
  const isImport = node.type === "ImportDeclaration";
  const isExport = node.type === "ExportNamedDeclaration" || node.type === "ExportAllDeclaration";
  const specifier = isImport || isExport ? stringValue(node.source) : undefined;
  if (specifier === undefined) {
    return undefined;
  }
  return { specifier, typeOnly: (isImport ? node.importKind : node.exportKind) === "type" };
}

function importEqualsReference(node: AstNode): ModuleReference | undefined {
  const reference = node.moduleReference;
  if (node.type !== "TSImportEqualsDeclaration" || !isNode(reference)) {
    return undefined;
  }
  const specifier =
    reference.type === "TSExternalModuleReference" ? stringValue(reference.expression) : undefined;
  return specifier === undefined ? undefined : { specifier, typeOnly: node.importKind === "type" };
}

function callReference(node: AstNode): ModuleReference | undefined {
  if (node.type === "ImportExpression") {
    const specifier = stringValue(node.source);
    return specifier === undefined ? undefined : { specifier, typeOnly: false };
  }
  const callee = node.callee;
  const args = node.arguments;
  if (
    node.type !== "CallExpression" ||
    !isNode(callee) ||
    callee.type !== "Identifier" ||
    callee.name !== "require" ||
    !Array.isArray(args)
  ) {
    return undefined;
  }
  const specifier = stringValue(args[0]);
  return specifier === undefined ? undefined : { specifier, typeOnly: false };
}

function typeReference(node: AstNode): ModuleReference | undefined {
  if (node.type !== "TSImportType") {
    return undefined;
  }
  const specifier = stringValue(node.source);
  return specifier === undefined ? undefined : { specifier, typeOnly: true };
}

export function moduleReferences(source: string, fileName = "probe.tsx"): ModuleReference[] {
  const { program, errors } = parseSync(fileName, source, {
    lang: fileName.endsWith(".tsx") ? "tsx" : "ts",
  });
  if (errors.length > 0) {
    throw new Error(`${fileName} does not parse: ${errors[0]?.message ?? "unknown error"}`);
  }
  const found: ModuleReference[] = [];
  function visit(value: unknown): void {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!isNode(value)) {
      return;
    }
    const reference =
      declarationReference(value) ??
      importEqualsReference(value) ??
      callReference(value) ??
      typeReference(value);
    if (reference !== undefined) {
      found.push(reference);
    }
    Object.values(value).forEach(visit);
  }
  visit(program);
  return found;
}

function packageName(specifier: string): string {
  const parts = specifier.split("/");
  return specifier.startsWith("@") ? parts.slice(0, 2).join("/") : (parts[0] ?? specifier);
}

export function violation(
  reference: ModuleReference,
  fromFile: string,
  srcRoot = SRC,
): string | undefined {
  if (reference.typeOnly) {
    return undefined;
  }
  const { specifier } = reference;
  if (specifier.startsWith(".")) {
    const target = relative(srcRoot, resolve(fromFile, "..", specifier));
    const top = target.split(sep)[0];
    return top !== undefined && BROWSER_DIRS.includes(top)
      ? undefined
      : "reaches outside the browser source";
  }
  if (specifier.startsWith("node:") || NODE_BUILTINS.has(specifier)) {
    return "imports a Node module";
  }
  return BROWSER_SAFE_PACKAGES.has(packageName(specifier))
    ? undefined
    : "imports a package the browser bundle does not allow";
}

function sources(dir: string): string[] {
  return readdirSync(join(SRC, dir), { recursive: true, encoding: "utf8" })
    .filter(
      (file) =>
        /\.tsx?$/.test(file) &&
        !/\.test\.tsx?$/.test(file) &&
        !file.endsWith(".d.ts") &&
        !file.includes("test-support"),
    )
    .map((file) => join(SRC, dir, file));
}

describe("the browser bundle's imports", () => {
  it.each(BROWSER_DIRS.flatMap(sources).map((file) => [relative(SRC, file), file]))(
    "%s pulls in nothing that only runs on Node",
    (_name, file) => {
      const problems = moduleReferences(readFileSync(file as string, "utf8"), file as string)
        .map((reference) => ({ reference, why: violation(reference, file as string) }))
        .filter((entry) => entry.why !== undefined)
        .map((entry) => `${entry.reference.specifier}: ${entry.why}`);

      expect(problems).toEqual([]);
    },
  );
});

describe("the import scanner", () => {
  it("refuses source it cannot parse instead of reporting no imports", () => {
    expect(() => moduleReferences("import {{ from;", "broken.ts")).toThrow(/does not parse/);
  });

  it("parses a .ts file with angle-bracket assertions", () => {
    expect(moduleReferences("const a = <string>b;", "cast.ts")).toEqual([]);
  });

  const HERE = join(SRC, "shared", "probe.ts");
  const bad = (code: string): string[] =>
    moduleReferences(code)
      .map((reference) => violation(reference, HERE))
      .filter((why): why is string => why !== undefined);

  it.each([
    ['import { redact } from "@verbatra/sdk";', "named value import"],
    ['import { type A, redact } from "@verbatra/sdk";', "mixed named import"],
    [
      'import { type A } from "@verbatra/sdk";',
      "inline type-only import still emits a side effect",
    ],
    ['import sdk from "@verbatra/sdk";', "default import"],
    ['import * as sdk from "@verbatra/sdk";', "namespace import"],
    ['import "@verbatra/sdk";', "side-effect import"],
    ['export { redact } from "@verbatra/sdk";', "named re-export"],
    ['export * from "@verbatra/sdk";', "star re-export"],
    ['export * as sdk from "@verbatra/sdk";', "namespace re-export"],
    ['const sdk = await import("@verbatra/sdk");', "dynamic import"],
    ['import sdk = require("@verbatra/sdk");', "import equals require"],
    ['const sdk = require("@verbatra/sdk");', "require call"],
    ['import { x } from "@verbatra/sdk/internal";', "subpath"],
    ['import { x } from "@verbatra/core";', "another workspace package"],
    ['import { x } from "@verbatra/format-adapters";', "another workspace package"],
    ['import { homedir } from "node:os";', "node: module"],
    ['import { readFileSync } from "fs";', "bare Node builtin"],
    ['import { join } from "path/posix";', "Node builtin subpath"],
    ['import { x } from "../server/rpc.js";', "the server"],
    ['import { x } from "../dev/server.js";', "the dev server"],
    ['import { x } from "../index.js";', "the package entry"],
    ['import { x } from "left-pad";', "an unlisted package"],
  ])("rejects %s (%s)", (code) => {
    expect(bad(code)).not.toEqual([]);
  });

  it.each([
    'import type { A } from "@verbatra/sdk";',
    'export type { A } from "@verbatra/sdk";',
    'type T = import("@verbatra/sdk").A;',
    'import { Button } from "@verbatra/ui";',
    'import { cn } from "@verbatra/ui/cn";',
    'import { z } from "zod";',
    'import { useState } from "react";',
    'import { x } from "../client/state.js";',
    'import { x } from "./sibling.js";',
  ])("accepts %s", (code) => {
    expect(bad(code)).toEqual([]);
  });
});
