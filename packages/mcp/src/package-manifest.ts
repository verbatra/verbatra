import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

export interface PackageManifest {
  readonly name: string;
  readonly version: string;
}

export function readPackageManifest(): PackageManifest {
  const manifestUrl = new URL("../package.json", import.meta.url);
  return JSON.parse(readFileSync(manifestUrl, "utf8")) as PackageManifest;
}

export function readSdkManifest(): PackageManifest {
  const manifestPath = createRequire(import.meta.url).resolve("@verbatra/sdk/package.json");
  return JSON.parse(readFileSync(manifestPath, "utf8")) as PackageManifest;
}
