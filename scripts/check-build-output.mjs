#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PUBLISHED_PACKAGES = new Set(["@verbatra/sdk", "@verbatra/studio"]);

const DECLARATION_SPECIFIER = /(?:from|import)\s*\(?\s*['"](@verbatra\/[a-z-]+)['"]/g;

const DYNAMIC_IMPORT_ONLY_PACKAGES = ["@verbatra/studio", "@verbatra/mcp"];

function dynamicImportPattern(packageName) {
  return new RegExp(`import\\(\\s*['"]${packageName}['"]\\s*\\)`);
}

function staticImportPattern(packageName) {
  return new RegExp(`(?:^|\\s)(?:import|export)[^\\n]*?from\\s*['"]${packageName}['"]`, "m");
}

function readBuildOutput(relativePath) {
  const absolutePath = resolve(REPO_ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`expected build output ${relativePath} is missing. Run the build first.`);
  }
  return readFileSync(absolutePath, "utf8");
}

function findForbiddenSpecifiers(relativePath) {
  const lines = readBuildOutput(relativePath).split("\n");
  const hits = [];
  for (let index = 0; index < lines.length; index += 1) {
    for (const match of (lines[index] ?? "").matchAll(DECLARATION_SPECIFIER)) {
      const specifier = match[1] ?? "";
      if (!PUBLISHED_PACKAGES.has(specifier)) {
        hits.push(`${relativePath}:${index + 1}: ${specifier}`);
      }
    }
  }
  return hits;
}

function checkDts() {
  const declarations = [
    "packages/sdk/dist/index.d.ts",
    "packages/sdk/dist/index.d.cts",
    "packages/cli/dist/lib.d.ts",
    "packages/studio/dist/index.d.ts",
  ];
  const hits = declarations.flatMap(findForbiddenSpecifiers);
  if (hits.length > 0) {
    throw new Error(
      `published declarations reference ${hits.length} unpublished @verbatra/* package(s); ` +
        `check dts.resolve in the owning tsup config:\n  ${hits.join("\n  ")}`,
    );
  }

  execFileSync(
    process.execPath,
    [
      resolve(REPO_ROOT, "node_modules/typescript/bin/tsc"),
      "--noEmit",
      "-p",
      resolve(REPO_ROOT, "scripts/dts-fixture/tsconfig.json"),
    ],
    { cwd: REPO_ROOT, stdio: "inherit" },
  );
  return "declarations reference no unpublished package, and the consumer fixture typechecks.";
}

function checkStudioBundle() {
  const entry = "packages/cli/dist/index.js";
  const contents = readBuildOutput(entry);
  for (const packageName of DYNAMIC_IMPORT_ONLY_PACKAGES) {
    if (!dynamicImportPattern(packageName).test(contents)) {
      throw new Error(
        `${entry} has no dynamic import("${packageName}"); check external in packages/cli/tsup.config.ts.`,
      );
    }
    if (staticImportPattern(packageName).test(contents)) {
      throw new Error(
        `${entry} statically imports ${packageName}, which would bundle it; keep it a runtime ` +
          "dynamic import and check external in packages/cli/tsup.config.ts.",
      );
    }
  }
  return "the studio and mcp commands survive bundling as runtime dynamic imports.";
}

function checkConfigSchema() {
  const relativePath = "packages/sdk/dist/config-schema.json";
  const document = JSON.parse(readBuildOutput(relativePath));
  if (typeof document.$schema !== "string") {
    throw new Error(
      `${relativePath} has no $schema meta key; an editor cannot validate against it. Check ` +
        "packages/sdk/scripts/emit-config-schema.mjs.",
    );
  }
  const pattern = document.properties?.files?.properties?.pattern?.pattern;
  if (typeof pattern !== "string") {
    throw new Error(
      `${relativePath} carries no files.pattern regex, so the {locale} token rule did not survive ` +
        "into the shipped document. Check that files.pattern is a field-level .regex() in " +
        "packages/sdk/src/config/schema.ts rather than a whole-config .refine().",
    );
  }
  return `the shipped config schema keeps its $schema key and the files.pattern rule (${pattern}).`;
}

const TARGETS = {
  dts: checkDts,
  "studio-bundle": checkStudioBundle,
  "config-schema": checkConfigSchema,
};

function main() {
  const requested = process.argv[2];
  if (requested !== undefined && !(requested in TARGETS)) {
    throw new Error(
      `unknown target "${requested}"; expected one of ${Object.keys(TARGETS).join(", ")}.`,
    );
  }
  const names = requested === undefined ? Object.keys(TARGETS) : [requested];
  for (const name of names) {
    console.log(`check-build-output(${name}): OK, ${TARGETS[name]()}`);
  }
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`check-build-output: ${message}`);
  process.exit(1);
}
