import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brandColorCss } from "../lib/brand-colors.ts";

const here = dirname(fileURLToPath(import.meta.url));
const outputPath = resolve(here, "../lib/version.generated.json");

function readVersion(packageDir) {
  const packageJsonPath = resolve(here, `../../../packages/${packageDir}/package.json`);
  const { version } = JSON.parse(readFileSync(packageJsonPath, "utf8"));
  if (typeof version !== "string" || version.length === 0) {
    throw new Error(`No usable version in ${packageJsonPath}`);
  }
  return version;
}

function readNodeRange(packageDir) {
  const packageJsonPath = resolve(here, `../../../packages/${packageDir}/package.json`);
  const range = JSON.parse(readFileSync(packageJsonPath, "utf8")).engines?.node;
  if (typeof range !== "string" || range.length === 0) {
    throw new Error(`No usable engines.node in ${packageJsonPath}`);
  }
  return range;
}

function readCoverageThreshold() {
  const configPath = resolve(here, "../../../packages/config/vitest.base.mjs");
  const block = /thresholds:\s*\{([^}]*)\}/.exec(readFileSync(configPath, "utf8"));
  const values = [...(block?.[1] ?? "").matchAll(/:\s*(\d+(?:\.\d+)?)/g)].map((match) =>
    Number(match[1]),
  );
  if (values.length === 0) {
    throw new Error(`No coverage thresholds in ${configPath}`);
  }
  return Math.min(...values);
}

const versions = {
  version: readVersion("cli"),
  studioVersion: readVersion("studio"),
  mcpVersion: readVersion("mcp"),
  nodeRange: readNodeRange("cli"),
  coverageThreshold: readCoverageThreshold(),
};

writeFileSync(outputPath, `${JSON.stringify(versions, null, 2)}\n`);

writeFileSync(resolve(here, "../app/brand-colors.generated.css"), brandColorCss());
