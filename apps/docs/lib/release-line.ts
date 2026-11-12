import type { IntroducedIn } from "./introduced-in";

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
