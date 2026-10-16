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

function versionParts(version: string): ReadonlyArray<number> {
  return version.split(".").map((part) => Number.parseInt(part, 10));
}

export function versionAtLeast(version: string, minimum: string): boolean {
  const actual = versionParts(version);
  const wanted = versionParts(minimum);
  for (let index = 0; index < 3; index += 1) {
    const difference = (actual[index] ?? 0) - (wanted[index] ?? 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
}
