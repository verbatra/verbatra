#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const PUBLISHED_PACKAGES = new Set(["@verbatra/sdk", "@verbatra/studio"]);

const PUBLISHED_PACKAGE_DIRS = ["sdk", "cli", "studio", "mcp"];

const JAVASCRIPT_TARGET = /\.[cm]?js$/;

const DECLARATION_SPECIFIER = /(?:from|import)\s*\(?\s*['"](@verbatra\/[a-z-]+)['"]/g;

const DYNAMIC_IMPORT_ONLY_PACKAGES = ["@verbatra/studio", "@verbatra/mcp"];

const LAZY_PROVIDER_PACKAGES = [
  "@anthropic-ai/sdk",
  "openai",
  "@google/genai",
  "deepl-node",
  "loglevel",
];

const SDK_ENTRIES = ["packages/sdk/dist/index.js", "packages/sdk/dist/index.cjs"];

const STUDIO_APP_ASSETS = "packages/studio/dist/app/assets";

const ZOD_JITLESS_CONFIG = /\(\{\s*jitless\s*:\s*(?:!0|true)\s*\}\)/;

function hasZodJitlessConfig(text) {
  return ZOD_JITLESS_CONFIG.test(text);
}

function dynamicImportPattern(packageName) {
  return new RegExp(`import\\(\\s*['"]${packageName}['"]\\s*\\)`);
}

function staticImportPattern(packageName) {
  return new RegExp(`(?:^|\\s)(?:import|export)[^\\n]*?from\\s*['"]${packageName}['"]`, "m");
}

function staticRequirePattern(packageName) {
  return new RegExp(`(?<![\\w$.])require\\(\\s*['"]${packageName}['"]\\s*\\)`);
}

function findEagerProviderImports(text, relativePath) {
  const hits = [];
  for (const packageName of LAZY_PROVIDER_PACKAGES) {
    if (
      staticImportPattern(packageName).test(text) ||
      staticRequirePattern(packageName).test(text)
    ) {
      hits.push(`${relativePath}: loads ${packageName} at startup`);
    }
    if (!dynamicImportPattern(packageName).test(text)) {
      hits.push(`${relativePath}: has no import("${packageName}")`);
    }
  }
  return hits;
}

function readBuildOutput(relativePath) {
  const absolutePath = resolve(REPO_ROOT, relativePath);
  if (!existsSync(absolutePath)) {
    throw new Error(`expected build output ${relativePath} is missing. Run the build first.`);
  }
  return readFileSync(absolutePath, "utf8");
}

function findForbiddenSpecifiersInText(text, relativePath, allowedPackages) {
  const lines = text.split("\n");
  const hits = [];
  for (let index = 0; index < lines.length; index += 1) {
    for (const match of (lines[index] ?? "").matchAll(DECLARATION_SPECIFIER)) {
      const specifier = match[1] ?? "";
      if (!allowedPackages.has(specifier)) {
        hits.push(`${relativePath}:${index + 1}: ${specifier}`);
      }
    }
  }
  return hits;
}

function findForbiddenSpecifiers(relativePath) {
  return findForbiddenSpecifiersInText(
    readBuildOutput(relativePath),
    relativePath,
    PUBLISHED_PACKAGES,
  );
}

function moduleFormat(path, packageType) {
  if (path.endsWith(".d.cts") || path.endsWith(".cjs")) {
    return "cjs";
  }
  if (path.endsWith(".d.mts") || path.endsWith(".mjs")) {
    return "esm";
  }
  return packageType === "module" ? "esm" : "cjs";
}

function collectExportTypeMismatches(node, inheritedTypes, packageType, trail, mismatches) {
  if (typeof node === "string") {
    if (JAVASCRIPT_TARGET.test(node) && inheritedTypes !== undefined) {
      const jsFormat = moduleFormat(node, packageType);
      const typesFormat = moduleFormat(inheritedTypes, packageType);
      if (jsFormat !== typesFormat) {
        mismatches.push(
          `${trail}: ${node} (${jsFormat}) is typed by ${inheritedTypes} (${typesFormat})`,
        );
      }
    }
    return;
  }
  if (node === null || typeof node !== "object") {
    return;
  }
  const types = typeof node.types === "string" ? node.types : inheritedTypes;
  for (const [key, value] of Object.entries(node)) {
    if (key !== "types") {
      collectExportTypeMismatches(value, types, packageType, `${trail} > ${key}`, mismatches);
    }
  }
}

function findExportTypeMismatches(manifest) {
  const mismatches = [];
  collectExportTypeMismatches(manifest.exports, undefined, manifest.type, "exports", mismatches);
  return mismatches;
}

function checkExportTypes() {
  const hits = PUBLISHED_PACKAGE_DIRS.flatMap((dir) => {
    const relativePath = `packages/${dir}/package.json`;
    const manifest = JSON.parse(readFileSync(resolve(REPO_ROOT, relativePath), "utf8"));
    return findExportTypeMismatches(manifest).map((hit) => `${relativePath} ${hit}`);
  });
  if (hits.length > 0) {
    throw new Error(
      "an exports condition pairs a JavaScript file with declarations of the other module " +
        `format; give each condition its own types:\n  ${hits.join("\n  ")}`,
    );
  }
}

function runTsc(tsconfig) {
  execFileSync(
    process.execPath,
    [
      resolve(REPO_ROOT, "node_modules/typescript/bin/tsc"),
      "--noEmit",
      "-p",
      resolve(REPO_ROOT, tsconfig),
    ],
    { cwd: REPO_ROOT, stdio: "inherit" },
  );
}

function checkDts() {
  const declarations = [
    "packages/sdk/dist/index.d.ts",
    "packages/sdk/dist/index.d.cts",
    "packages/cli/dist/lib.d.ts",
    "packages/cli/dist/lib.d.cts",
    "packages/studio/dist/index.d.ts",
  ];
  const hits = declarations.flatMap(findForbiddenSpecifiers);
  if (hits.length > 0) {
    throw new Error(
      `published declarations reference ${hits.length} unpublished @verbatra/* package(s); ` +
        `check dts.resolve in the owning tsup config:\n  ${hits.join("\n  ")}`,
    );
  }

  checkExportTypes();
  runTsc("scripts/dts-fixture/tsconfig.json");
  runTsc("scripts/dts-fixture/tsconfig.cjs.json");
  return (
    "declarations reference no unpublished package, every exports condition pairs matching " +
    "module formats, and the ESM and CommonJS consumer fixtures typecheck."
  );
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
  checkStudioZodJitless();
  return (
    "the studio and mcp commands survive bundling as runtime dynamic imports, and the Studio " +
    "client bundle keeps its zod jitless config."
  );
}

function checkStudioZodJitless() {
  const assetsDir = resolve(REPO_ROOT, STUDIO_APP_ASSETS);
  if (!existsSync(assetsDir)) {
    throw new Error(`expected build output ${STUDIO_APP_ASSETS} is missing. Run the build first.`);
  }
  const scripts = readdirSync(assetsDir).filter((name) => name.endsWith(".js"));
  if (scripts.length === 0) {
    throw new Error(`${STUDIO_APP_ASSETS} holds no JavaScript bundle. Run the build first.`);
  }
  const configured = scripts.some((name) =>
    hasZodJitlessConfig(readBuildOutput(`${STUDIO_APP_ASSETS}/${name}`)),
  );
  if (!configured) {
    throw new Error(
      `${STUDIO_APP_ASSETS} has no z.config({ jitless: true }) call, so zod probes for eval under ` +
        "the dashboard's script-src 'self' policy. Check that packages/studio/package.json " +
        "sideEffects keeps src/app/zod-jitless.ts.",
    );
  }
}

function checkLazyProviderSdks() {
  const hits = SDK_ENTRIES.flatMap((entry) =>
    findEagerProviderImports(readBuildOutput(entry), entry),
  );
  if (hits.length > 0) {
    throw new Error(
      "a provider SDK is no longer loaded on first use; import it with await import() inside " +
        `its client in packages/ai-providers/src:\n  ${hits.join("\n  ")}`,
    );
  }
  return "the ESM and CommonJS sdk entries load every provider SDK through a runtime import().";
}

function getConfigSchemaFilesPattern(document) {
  return document.properties?.files?.properties?.pattern?.pattern;
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
  const pattern = getConfigSchemaFilesPattern(document);
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
  "lazy-provider-sdks": checkLazyProviderSdks,
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`check-build-output: ${message}`);
    process.exit(1);
  }
}

export {
  DECLARATION_SPECIFIER,
  dynamicImportPattern,
  findEagerProviderImports,
  findExportTypeMismatches,
  findForbiddenSpecifiersInText,
  getConfigSchemaFilesPattern,
  hasZodJitlessConfig,
  staticImportPattern,
  staticRequirePattern,
};
