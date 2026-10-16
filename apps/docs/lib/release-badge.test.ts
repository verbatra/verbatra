import { describe, expect, it } from "vitest";
import { MACHINE_PROVIDER_IDS } from "./landing-facts";
import { providerReleaseBadge, RELEASE_BADGE } from "./release-badge";

describe("release badge", () => {
  it("dates exactly the providers it names, all with the one release version", () => {
    const badged = MACHINE_PROVIDER_IDS.filter((id) => providerReleaseBadge(id) !== null);
    expect(badged).toEqual([...RELEASE_BADGE.providers]);
    for (const id of badged) expect(providerReleaseBadge(id)).toBe(RELEASE_BADGE.version);
  });

  it("names a semantic version", () => {
    expect(RELEASE_BADGE.version).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
