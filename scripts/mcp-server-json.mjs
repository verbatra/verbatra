#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MCP_MANIFEST_PATH = resolve(REPO_ROOT, "packages/mcp/package.json");
const SERVER_JSON_PATH = resolve(REPO_ROOT, "packages/mcp/server.json");

function npmPackages(serverJson) {
  return (serverJson.packages ?? []).filter((entry) => entry.registryType === "npm");
}

function serverJsonMismatches(serverJson, manifest) {
  const mismatches = [];
  if (serverJson.name !== manifest.mcpName) {
    mismatches.push(
      `server.json name "${serverJson.name}" does not match package.json mcpName "${manifest.mcpName}"`,
    );
  }
  if (serverJson.version !== manifest.version) {
    mismatches.push(
      `server.json version "${serverJson.version}" does not match package.json version "${manifest.version}"`,
    );
  }
  const packages = npmPackages(serverJson);
  if (packages.length !== 1) {
    mismatches.push(`server.json lists ${packages.length} npm packages, expected exactly 1`);
    return mismatches;
  }
  const [entry] = packages;
  if (entry.identifier !== manifest.name) {
    mismatches.push(
      `server.json npm identifier "${entry.identifier}" does not match package.json name "${manifest.name}"`,
    );
  }
  if (entry.version !== manifest.version) {
    mismatches.push(
      `server.json npm package version "${entry.version}" does not match package.json version "${manifest.version}"`,
    );
  }
  return mismatches;
}

function syncServerJson(serverJson, manifest) {
  return {
    ...serverJson,
    version: manifest.version,
    packages: (serverJson.packages ?? []).map((entry) =>
      entry.registryType === "npm" && entry.identifier === manifest.name
        ? { ...entry, version: manifest.version }
        : entry,
    ),
  };
}

function publishedVersionMismatches(serverJson, publishedPackagesJson, packageName) {
  const published = JSON.parse(publishedPackagesJson);
  if (!Array.isArray(published)) {
    return ["PUBLISHED_PACKAGES_JSON is not an array"];
  }
  const entry = published.find((candidate) => candidate?.name === packageName);
  if (entry === undefined) {
    return [`${packageName} is not in PUBLISHED_PACKAGES_JSON`];
  }
  if (entry.version !== serverJson.version) {
    return [
      `server.json version "${serverJson.version}" does not match the published ${packageName}@${entry.version}`,
    ];
  }
  return [];
}

function renderServerJson(serverJson) {
  return `${JSON.stringify(serverJson, null, 2)}\n`;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function reportMismatches(mismatches) {
  for (const mismatch of mismatches) {
    console.error(`mcp-server-json: ${mismatch}`);
  }
}

function runSync(serverJsonPath, manifestPath) {
  const manifest = readJson(manifestPath);
  const synced = syncServerJson(readJson(serverJsonPath), manifest);
  const mismatches = serverJsonMismatches(synced, manifest);
  if (mismatches.length > 0) {
    reportMismatches(mismatches);
    return 1;
  }
  writeFileSync(serverJsonPath, renderServerJson(synced));
  return 0;
}

function main(mode) {
  if (mode === "sync") {
    return runSync(SERVER_JSON_PATH, MCP_MANIFEST_PATH);
  }
  if (mode !== "check") {
    console.error(`mcp-server-json: unknown mode "${mode}", expected "sync" or "check"`);
    return 2;
  }

  const manifest = readJson(MCP_MANIFEST_PATH);
  const serverJson = readJson(SERVER_JSON_PATH);
  const published = process.env.PUBLISHED_PACKAGES_JSON;
  const mismatches = [
    ...serverJsonMismatches(serverJson, manifest),
    ...(published ? publishedVersionMismatches(serverJson, published, manifest.name) : []),
  ];
  reportMismatches(mismatches);
  return mismatches.length === 0 ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv[2]);
}

export {
  publishedVersionMismatches,
  renderServerJson,
  runSync,
  serverJsonMismatches,
  syncServerJson,
};
