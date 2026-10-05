import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readContributors } from "./contributors";
import { CONTRIBUTORS_URL, refreshContributors } from "./contributors-refresh";

const failingRename = vi.hoisted(() => ({ from: undefined as string | undefined }));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    rename: async (from: string, to: string) => {
      if (from === failingRename.from) {
        throw Object.assign(new Error(`EXDEV: cross-device link not permitted, ${from}`), {
          code: "EXDEV",
        });
      }
      return actual.rename(from, to);
    },
  };
});

const OLD_AVATAR = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

const fetchOneContributor = (async (url: string | URL | Request) =>
  String(url) === CONTRIBUTORS_URL
    ? new Response(
        JSON.stringify([
          {
            login: "mariokreitz",
            avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
            html_url: "https://github.com/mariokreitz",
            type: "User",
          },
        ]),
      )
    : new Response(new Uint8Array([0xff, 0xd8]), {
        headers: { "content-type": "image/png" },
      })) as typeof fetch;

describe("refreshContributors when the staged avatars cannot be moved into place", () => {
  let dir: string;
  let avatarDir: string;
  let manifestPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "contributors-rollback-"));
    avatarDir = join(dir, "public", "contributors");
    manifestPath = join(dir, "contributors.json");
    failingRename.from = `${avatarDir}.staging`;
  });

  afterEach(async () => {
    failingRename.from = undefined;
    await rm(dir, { recursive: true, force: true });
  });

  it("puts the previous avatars back and rethrows", async () => {
    await mkdir(avatarDir, { recursive: true });
    await writeFile(join(avatarDir, "old.png"), OLD_AVATAR);

    await expect(
      refreshContributors({
        avatarDir,
        manifestPath,
        validate: readContributors,
        fetch: fetchOneContributor,
      }),
    ).rejects.toThrow(/EXDEV/);

    expect(await readdir(avatarDir)).toEqual(["old.png"]);
    expect(new Uint8Array(await readFile(join(avatarDir, "old.png")))).toEqual(OLD_AVATAR);
    expect(await readdir(join(dir, "public"))).not.toContain("contributors.previous");
  });

  it("rethrows without restoring anything when there were no previous avatars", async () => {
    await expect(
      refreshContributors({
        avatarDir,
        manifestPath,
        validate: readContributors,
        fetch: fetchOneContributor,
      }),
    ).rejects.toThrow(/EXDEV/);

    expect(await readdir(join(dir, "public"))).toEqual(["contributors.staging"]);
  });
});
