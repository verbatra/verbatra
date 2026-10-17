import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

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

const versions = {
  version: readVersion("cli"),
  studioVersion: readVersion("studio"),
  mcpVersion: readVersion("mcp"),
  nodeRange: readNodeRange("cli"),
};

writeFileSync(outputPath, `${JSON.stringify(versions, null, 2)}\n`);
