import { describe, expect, it } from "vitest";
import { isStillNew, type ReleasedVersions } from "./release-line";

const released: ReleasedVersions = { cli: "0.11.1", studio: "0.5.2", mcp: "0.2.2" };

describe("isStillNew", () => {
  it("keeps a page new through patch releases of the minor that introduced it", () => {
    expect(isStillNew({ version: "0.11.0" }, released)).toBe(true);
  });

  it("keeps a page new while its release is still unreleased", () => {
    expect(isStillNew({ version: "0.12.0" }, released)).toBe(true);
  });

  it("expires once the next minor release ships", () => {
    expect(isStillNew({ version: "0.10.0" }, released)).toBe(false);
    expect(isStillNew({ version: "0.11.0" }, { ...released, cli: "0.12.0" })).toBe(false);
    expect(isStillNew({ version: "0.11.0" }, { ...released, cli: "1.0.0" })).toBe(false);
  });

  it("dates a package-scoped page against that package's own release", () => {
    expect(isStillNew({ version: "0.2.0", pkg: "@verbatra/mcp" }, released)).toBe(true);
    expect(isStillNew({ version: "0.4.0", pkg: "@verbatra/studio" }, released)).toBe(false);
    expect(isStillNew({ version: "0.11.0", pkg: "@verbatra/sdk" }, released)).toBe(true);
  });

  it("never badges an unknown package or an unreadable version", () => {
    expect(isStillNew({ version: "0.11.0", pkg: "@verbatra/unknown" }, released)).toBe(false);
    expect(isStillNew({ version: "next" }, released)).toBe(false);
    expect(isStillNew({ version: "0.11.0" }, { ...released, cli: "dev" })).toBe(false);
  });
});

describe("isStillNew across the release lines", () => {
  const current: ReleasedVersions = { cli: "0.13.4", studio: "0.7.4", mcp: "0.4.4" };

  it.each([
    ["last version of the previous line", { version: "0.12.9" }, false],
    ["first version of the current line", { version: "0.13.0" }, true],
    ["a patch of the current line", { version: "0.13.2" }, true],
    ["the current version itself", { version: "0.13.4" }, true],
    ["the next unreleased patch", { version: "0.13.5" }, true],
    ["the next unreleased minor", { version: "0.14.0" }, true],
    ["a patch of the previous line", { version: "0.12.0" }, false],
    ["the sdk follows the cli line", { version: "0.13.0", pkg: "@verbatra/sdk" }, true],
    ["the sdk on an older cli line", { version: "0.12.3", pkg: "@verbatra/sdk" }, false],
    ["studio, last of the previous line", { version: "0.6.9", pkg: "@verbatra/studio" }, false],
    ["studio, first of the current line", { version: "0.7.0", pkg: "@verbatra/studio" }, true],
    ["studio, next unreleased minor", { version: "0.8.0", pkg: "@verbatra/studio" }, true],
    ["studio is not dated by the cli line", { version: "0.13.0", pkg: "@verbatra/studio" }, true],
    ["mcp, last of the previous line", { version: "0.3.9", pkg: "@verbatra/mcp" }, false],
    ["mcp, first of the current line", { version: "0.4.0", pkg: "@verbatra/mcp" }, true],
    ["mcp, next unreleased minor", { version: "0.5.0", pkg: "@verbatra/mcp" }, true],
  ])("%s", (_name, introducedIn, expected) => {
    expect(isStillNew(introducedIn, current)).toBe(expected);
  });

  it("moves every line forward when a package releases its next minor", () => {
    expect(isStillNew({ version: "0.13.0" }, { ...current, cli: "0.14.0" })).toBe(false);
    expect(isStillNew({ version: "0.14.0" }, { ...current, cli: "0.14.0" })).toBe(true);
    expect(
      isStillNew({ version: "0.7.0", pkg: "@verbatra/studio" }, { ...current, studio: "0.8.0" }),
    ).toBe(false);
  });
});
