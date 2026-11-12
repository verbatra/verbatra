import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brandColorCss } from "../lib/brand-colors.ts";
import { packageReleases, VERSION_PACKAGES, versionPillCss } from "../lib/release-lines.mjs";

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

const releasesPath = resolve(here, "../lib/release-lines.generated.json");
const pillStylesPath = resolve(here, "../app/version-pills.generated.css");

function readReleases(packageDir) {
  const changelogPath = resolve(here, `../../../packages/${packageDir}/CHANGELOG.md`);
  return packageReleases(readFileSync(changelogPath, "utf8"));
}

const releases = Object.fromEntries(VERSION_PACKAGES.map((pkg) => [pkg, readReleases(pkg)]));

writeFileSync(releasesPath, `${JSON.stringify(releases, null, 2)}\n`);
writeFileSync(pillStylesPath, versionPillCss(releases));

writeFileSync(resolve(here, "../app/brand-colors.generated.css"), brandColorCss());
