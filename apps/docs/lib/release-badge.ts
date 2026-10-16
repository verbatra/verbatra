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
