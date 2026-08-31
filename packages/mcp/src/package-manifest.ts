import { readFileSync } from "node:fs";

export interface PackageManifest {
  readonly name: string;
  readonly version: string;
}

export function readPackageManifest(): PackageManifest {
  const manifestUrl = new URL("../package.json", import.meta.url);
  return JSON.parse(readFileSync(manifestUrl, "utf8")) as PackageManifest;
}
