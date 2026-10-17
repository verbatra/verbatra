import type { MachineProviderId } from "./landing-facts";

type ReleaseFeature = "provider-none";

type ReleaseBadge = {
  readonly version: string;
  readonly providers: ReadonlyArray<MachineProviderId>;
  readonly features: ReadonlyArray<ReleaseFeature>;
};

export const RELEASE_BADGE: ReleaseBadge = {
  version: "0.12.0",
  providers: ["libretranslate"],
  features: ["provider-none"],
};

export function providerReleaseBadge(id: MachineProviderId): string | null {
  return RELEASE_BADGE.providers.includes(id) ? RELEASE_BADGE.version : null;
}

export function featureReleaseBadge(feature: ReleaseFeature): string | null {
  return RELEASE_BADGE.features.includes(feature) ? RELEASE_BADGE.version : null;
}

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

type ParsedVersion = {
  readonly core: readonly [number, number, number];
  readonly prerelease: ReadonlyArray<string>;
};

function parseVersion(version: string): ParsedVersion {
  const match = SEMVER.exec(version);
  if (match === null) throw new Error(`not a semantic version: ${version}`);
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] === undefined ? [] : match[4].split("."),
  };
}

const NUMERIC = /^\d+$/;

function compareIdentifier(left: string, right: string): number {
  const leftNumeric = NUMERIC.test(left);
  const rightNumeric = NUMERIC.test(right);
  if (leftNumeric && rightNumeric) return Number(left) - Number(right);
  if (leftNumeric !== rightNumeric) return leftNumeric ? -1 : 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePrerelease(left: ReadonlyArray<string>, right: ReadonlyArray<string>): number {
  if (left.length === 0 || right.length === 0) return right.length - left.length;
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    const difference = compareIdentifier(left[index] ?? "", right[index] ?? "");
    if (difference !== 0) return difference;
  }
  return left.length - right.length;
}

function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  for (const index of [0, 1, 2] as const) {
    const difference = a.core[index] - b.core[index];
    if (difference !== 0) return difference;
  }
  return comparePrerelease(a.prerelease, b.prerelease);
}

export function versionAtLeast(version: string, minimum: string): boolean {
  return compareVersions(version, minimum) >= 0;
}
