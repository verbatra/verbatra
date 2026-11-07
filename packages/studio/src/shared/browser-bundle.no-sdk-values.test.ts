import { readdirSync, readFileSync } from "node:fs";
import { builtinModules } from "node:module";
import { join, relative, resolve, sep } from "node:path";
import ts from "typescript";
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

function importReference(node: ts.Node): ModuleReference | undefined {
  if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
    return {
      specifier: node.moduleSpecifier.text,
      typeOnly: node.importClause?.isTypeOnly === true,
    };
  }
  if (
    ts.isExportDeclaration(node) &&
    node.moduleSpecifier !== undefined &&
    ts.isStringLiteral(node.moduleSpecifier)
  ) {
    return { specifier: node.moduleSpecifier.text, typeOnly: node.isTypeOnly };
  }
  if (
    ts.isImportEqualsDeclaration(node) &&
    ts.isExternalModuleReference(node.moduleReference) &&
    ts.isStringLiteral(node.moduleReference.expression)
  ) {
    return { specifier: node.moduleReference.expression.text, typeOnly: node.isTypeOnly };
  }
  return undefined;
}

function callReference(node: ts.Node): ModuleReference | undefined {
  if (!ts.isCallExpression(node)) {
    return undefined;
  }
  const callee = node.expression;
  const loads =
    callee.kind === ts.SyntaxKind.ImportKeyword ||
    (ts.isIdentifier(callee) && callee.text === "require");
  const first = node.arguments[0];
  return loads && first !== undefined && ts.isStringLiteralLike(first)
    ? { specifier: first.text, typeOnly: false }
    : undefined;
}

function typeReference(node: ts.Node): ModuleReference | undefined {
  return ts.isImportTypeNode(node) &&
    ts.isLiteralTypeNode(node.argument) &&
    ts.isStringLiteral(node.argument.literal)
    ? { specifier: node.argument.literal.text, typeOnly: true }
    : undefined;
}

export function moduleReferences(source: string): ModuleReference[] {
  const file = ts.createSourceFile("probe.tsx", source, ts.ScriptTarget.Latest, true);
  const found: ModuleReference[] = [];
  function visit(node: ts.Node): void {
    const reference = importReference(node) ?? callReference(node) ?? typeReference(node);
    if (reference !== undefined) {
      found.push(reference);
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
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
      const problems = moduleReferences(readFileSync(file as string, "utf8"))
        .map((reference) => ({ reference, why: violation(reference, file as string) }))
        .filter((entry) => entry.why !== undefined)
        .map((entry) => `${entry.reference.specifier}: ${entry.why}`);

      expect(problems).toEqual([]);
    },
  );
});

describe("the import scanner", () => {
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
