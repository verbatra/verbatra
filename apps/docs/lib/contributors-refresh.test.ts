import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readContributors } from "./contributors";
import {
  avatarDownloadUrl,
  CONTRIBUTORS_URL,
  parseContributors,
  refreshContributors,
} from "./contributors-refresh";

const USER_ENTRY = {
  login: "mariokreitz",
  avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
  html_url: "https://github.com/mariokreitz",
  contributions: 120,
  type: "User",
};

const BOT_ENTRY = {
  login: "dependabot-bot",
  avatar_url: "https://avatars.githubusercontent.com/in/29110?v=4",
  html_url: "https://github.com/apps/dependabot",
  contributions: 4,
  type: "Bot",
};

const AVATAR_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function imageResponse(contentType: string, status = 200): Response {
  return new Response(AVATAR_BYTES, { status, headers: { "content-type": contentType } });
}

describe("parseContributors", () => {
  it("keeps User entries and drops Bot entries", () => {
    expect(parseContributors([USER_ENTRY, BOT_ENTRY])).toEqual([
      {
        login: "mariokreitz",
        avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
        profileUrl: "https://github.com/mariokreitz",
      },
    ]);
  });

  it("caps the result at the given count, preserving input order", () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({ ...USER_ENTRY, login: `user-${i}` }));
    expect(parseContributors(entries, 2).map((c) => c.login)).toEqual(["user-0", "user-1"]);
  });

  it.each([
    { login: "incomplete" },
    { ...USER_ENTRY, login: "../escape" },
    { ...USER_ENTRY, avatar_url: "not a url" },
  ])("skips the malformed or unsafe entry %j", (entry) => {
    expect(parseContributors([entry, USER_ENTRY]).map((c) => c.login)).toEqual(["mariokreitz"]);
  });

  it("returns an empty array when the response is not an array", () => {
    expect(parseContributors({ message: "Not Found" })).toEqual([]);
    expect(parseContributors(null)).toEqual([]);
  });
});

describe("avatarDownloadUrl", () => {
  it("requests a 64 pixel avatar while keeping the existing query", () => {
    const url = new URL(avatarDownloadUrl(USER_ENTRY.avatar_url));
    expect(url.searchParams.get("s")).toBe("64");
    expect(url.searchParams.get("v")).toBe("4");
  });
});

describe("refreshContributors", () => {
  let dir: string;
  let avatarDir: string;
  let manifestPath: string;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "contributors-"));
    avatarDir = join(dir, "public", "contributors");
    manifestPath = join(dir, "contributors.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("writes self-hosted avatars and a manifest the runtime reader accepts", async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url) === CONTRIBUTORS_URL
        ? jsonResponse([USER_ENTRY, BOT_ENTRY])
        : imageResponse("image/jpeg; charset=binary"),
    );

    const contributors = await refreshContributors({
      avatarDir,
      manifestPath,
      fetch: fetchMock as typeof fetch,
    });

    expect(contributors).toEqual([
      {
        login: "mariokreitz",
        avatarPath: "/contributors/mariokreitz.jpg",
        profileUrl: "https://github.com/mariokreitz",
      },
    ]);
    expect(readContributors(JSON.parse(await readFile(manifestPath, "utf8")))).toEqual(
      contributors,
    );
    expect(new Uint8Array(await readFile(join(avatarDir, "mariokreitz.jpg")))).toEqual(
      AVATAR_BYTES,
    );
  });

  it("removes avatars of contributors no longer listed", async () => {
    await refreshContributors({
      avatarDir,
      manifestPath,
      fetch: (async () => jsonResponse([])) as typeof fetch,
    });
    await writeFile(join(avatarDir, "stale.png"), AVATAR_BYTES);

    await refreshContributors({
      avatarDir,
      manifestPath,
      fetch: (async () => jsonResponse([])) as typeof fetch,
    });

    expect(await readdir(avatarDir)).toEqual([]);
  });

  it("sends a Bearer Authorization header only when a token is given", async () => {
    const fetchMock = vi.fn(async () => jsonResponse([]));

    await refreshContributors({ avatarDir, manifestPath, fetch: fetchMock as typeof fetch });
    await refreshContributors({
      avatarDir,
      manifestPath,
      token: "test-token",
      fetch: fetchMock as typeof fetch,
    });

    const headersOf = (call: number): Record<string, string> =>
      (fetchMock.mock.calls[call] as unknown as [string, { headers: Record<string, string> }])[1]
        .headers;
    expect(headersOf(0).Authorization).toBeUndefined();
    expect(headersOf(1).Authorization).toBe("Bearer test-token");
  });

  it("throws and leaves the manifest untouched when the contributor list fails", async () => {
    await writeFile(manifestPath, "[]\n");

    await expect(
      refreshContributors({
        avatarDir,
        manifestPath,
        fetch: (async () => jsonResponse({}, 503)) as typeof fetch,
      }),
    ).rejects.toThrow("status 503");
    expect(await readFile(manifestPath, "utf8")).toBe("[]\n");
  });

  it.each([
    { response: () => imageResponse("image/png", 404), message: "status 404" },
    { response: () => imageResponse("image/svg+xml"), message: "unsupported content type" },
    {
      response: () => new Response(AVATAR_BYTES, { status: 200 }),
      message: "unsupported content type",
    },
  ])("throws before writing anything when an avatar download fails ($message)", async (c) => {
    const fetchMock = vi.fn(async (url: string | URL | Request) =>
      String(url) === CONTRIBUTORS_URL ? jsonResponse([USER_ENTRY]) : c.response(),
    );

    await expect(
      refreshContributors({ avatarDir, manifestPath, fetch: fetchMock as typeof fetch }),
    ).rejects.toThrow(c.message);
    await expect(readFile(manifestPath, "utf8")).rejects.toThrow();
  });
});
