import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CONTRIBUTORS, readContributors } from "./contributors";

const PUBLIC_DIR = fileURLToPath(new URL("../public", import.meta.url));

const VALID_ENTRY = {
  login: "mariokreitz",
  avatarPath: "/contributors/mariokreitz.jpg",
  profileUrl: "https://github.com/mariokreitz",
};

describe("readContributors", () => {
  it("accepts an entry whose avatar is a self-hosted path", () => {
    expect(readContributors([VALID_ENTRY])).toEqual([VALID_ENTRY]);
  });

  it.each([
    "https://avatars.githubusercontent.com/u/1?v=4",
    "//avatars.githubusercontent.com/u/1",
    "/contributors/../og-image.png",
    "/elsewhere/mariokreitz.jpg",
    "/contributors/mariokreitz.svg",
  ])("rejects the avatar path %s", (avatarPath) => {
    expect(() => readContributors([{ ...VALID_ENTRY, avatarPath }])).toThrow();
  });

  it("rejects a profile link outside github.com", () => {
    expect(() =>
      readContributors([{ ...VALID_ENTRY, profileUrl: "https://example.com/mariokreitz" }]),
    ).toThrow();
  });

  it("rejects unknown fields", () => {
    expect(() => readContributors([{ ...VALID_ENTRY, avatarUrl: "https://x.test/a" }])).toThrow();
  });
});

describe("CONTRIBUTORS", () => {
  it("lists at least one contributor", () => {
    expect(CONTRIBUTORS.length).toBeGreaterThan(0);
  });

  it("points every avatar at a committed file under public", () => {
    for (const contributor of CONTRIBUTORS) {
      expect(existsSync(`${PUBLIC_DIR}${contributor.avatarPath}`)).toBe(true);
    }
  });
});
