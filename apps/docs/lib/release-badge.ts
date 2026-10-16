import type { MachineProviderId } from "./landing-facts";

type ReleaseBadge = {
  readonly version: string;
  readonly providers: ReadonlyArray<MachineProviderId>;
};

export const RELEASE_BADGE: ReleaseBadge = {
  version: "0.12.0",
  providers: ["libretranslate"],
};

export function providerReleaseBadge(id: MachineProviderId): string | null {
  return RELEASE_BADGE.providers.includes(id) ? RELEASE_BADGE.version : null;
}
