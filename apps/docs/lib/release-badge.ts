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

const SEMVER = /^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/;

type ParsedVersion = { readonly core: ReadonlyArray<number>; readonly prerelease: boolean };

function parseVersion(version: string): ParsedVersion {
  const match = SEMVER.exec(version);
  if (match === null) throw new Error(`not a semantic version: ${version}`);
  return {
    core: [Number(match[1]), Number(match[2]), Number(match[3])],
    prerelease: match[4] !== undefined,
  };
}

export function versionAtLeast(version: string, minimum: string): boolean {
  const actual = parseVersion(version);
  const wanted = parseVersion(minimum);
  for (let index = 0; index < 3; index += 1) {
    const difference = (actual.core[index] ?? 0) - (wanted.core[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return !actual.prerelease || wanted.prerelease;
}
