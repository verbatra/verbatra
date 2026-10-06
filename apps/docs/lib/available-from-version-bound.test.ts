import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readIncludedSource } from "./docs-pages";

const CONTENT_DIR = join(import.meta.dirname, "../content/docs");
const PACKAGES_DIR = join(import.meta.dirname, "../../../packages");
const AVAILABLE_FROM = /<AvailableFrom\s+version="([^"]+)"(?:\s+pkg="([^"]+)")?\s*\/>/g;
const DEFAULT_PACKAGE = "@verbatra/cli";
const PACKAGE_DIRS: Record<string, string> = {
  "@verbatra/cli": "cli",
  "@verbatra/sdk": "sdk",
  "@verbatra/studio": "studio",
  "@verbatra/mcp": "mcp",
};

type Version = readonly [number, number, number];

function parseVersion(version: string): Version {
  const [major = Number.NaN, minor = Number.NaN, patch = Number.NaN] = version
    .split(".")
    .map(Number);
  return [major, minor, patch];
}

function compareVersions(left: Version, right: Version): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

function nextReleaseCeiling(current: string): Version {
  const [major, minor] = parseVersion(current);
  return major === 0 ? [0, minor + 1, 0] : [major + 1, 0, 0];
}

function currentVersion(pkg: string): string {
  const dir = PACKAGE_DIRS[pkg];
  if (dir === undefined) throw new Error(`unknown package ${pkg}`);
  const manifest = JSON.parse(readFileSync(join(PACKAGES_DIR, dir, "package.json"), "utf8"));
  return manifest.version;
}

function badges(): { file: string; version: string; pkg: string }[] {
  return readdirSync(CONTENT_DIR, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".mdx"))
    .flatMap((file) =>
      [...readIncludedSource(join(CONTENT_DIR, file)).matchAll(AVAILABLE_FROM)].map((match) => ({
        file,
        version: match[1] ?? "",
        pkg: match[2] ?? DEFAULT_PACKAGE,
      })),
    );
}

describe("AvailableFrom versions", () => {
  it("allows at most the next minor release while the package is below 1.0", () => {
    expect(nextReleaseCeiling("0.5.2")).toEqual([0, 6, 0]);
    expect(nextReleaseCeiling("1.4.0")).toEqual([2, 0, 0]);
  });

  it("never names a version beyond the next release of its package", () => {
    const beyond = badges().filter(
      ({ version, pkg }) =>
        compareVersions(parseVersion(version), nextReleaseCeiling(currentVersion(pkg))) > 0,
    );
    expect(beyond).toEqual([]);
  });
});
