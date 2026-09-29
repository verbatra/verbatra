import type { LoaderPlugin } from "fumadocs-core/source";
import type { Item } from "fumadocs-core/source/plugins/status-badges";
import { type IntroducedIn, readIntroducedIn } from "./introduced-in";

export type ReleasedVersions = {
  cli: string;
  studio: string;
  mcp: string;
};

type Semver = readonly [number, number, number];

const PACKAGE_RELEASE: Record<string, keyof ReleasedVersions> = {
  "@verbatra/cli": "cli",
  "@verbatra/sdk": "cli",
  "@verbatra/studio": "studio",
  "@verbatra/mcp": "mcp",
};

function parseSemver(version: string): Semver | undefined {
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
  if (!match) return undefined;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareSemver(left: Semver, right: Semver): number {
  return left[0] - right[0] || left[1] - right[1] || left[2] - right[2];
}

function releasedVersionFor(
  introducedIn: IntroducedIn,
  released: ReleasedVersions,
): string | undefined {
  if (introducedIn.pkg === undefined) return released.cli;
  const key = PACKAGE_RELEASE[introducedIn.pkg];
  return key === undefined ? undefined : released[key];
}

export function isStillNew(introducedIn: IntroducedIn, released: ReleasedVersions): boolean {
  const introduced = parseSemver(introducedIn.version);
  const releasedVersion = releasedVersionFor(introducedIn, released);
  const current = releasedVersion === undefined ? undefined : parseSemver(releasedVersion);
  if (!introduced || !current) return false;
  const expiresAt: Semver = [introduced[0], introduced[1] + 1, 0];
  return compareSemver(current, expiresAt) < 0;
}

export function pageStatus(data: object, released: ReleasedVersions): string | undefined {
  const status = "status" in data && typeof data.status === "string" ? data.status : undefined;
  if (status !== "new") return status;
  const introducedIn = readIntroducedIn("_exports" in data ? data._exports : undefined);
  return introducedIn && isStillNew(introducedIn, released) ? status : undefined;
}

export function expiringStatusPlugin(released: ReleasedVersions): LoaderPlugin {
  return {
    name: "verbatra:expiring-status",
    transformPageTree: {
      file(node, filePath) {
        if (!filePath) return node;
        const file = this.storage.read(filePath);
        if (file?.format !== "page") return node;
        const status = pageStatus(file.data, released);
        if (status === undefined) return node;
        const item: Item = { ...node, status };
        return item;
      },
    },
  };
}
