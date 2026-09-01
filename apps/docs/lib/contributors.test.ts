import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchContributors, parseContributors } from "./contributors";

const USER_ENTRY = {
  login: "mariokreitz",
  avatar_url: "https://avatars.githubusercontent.com/u/1?v=4",
  html_url: "https://github.com/mariokreitz",
  contributions: 120,
  type: "User",
};

const BOT_ENTRY = {
  login: "dependabot[bot]",
  avatar_url: "https://avatars.githubusercontent.com/in/29110?v=4",
  html_url: "https://github.com/apps/dependabot",
  contributions: 4,
  type: "Bot",
};

const originalGithubToken = process.env.GITHUB_TOKEN;

afterEach(() => {
  if (originalGithubToken === undefined) {
    delete process.env.GITHUB_TOKEN;
  } else {
    process.env.GITHUB_TOKEN = originalGithubToken;
  }
});

describe("parseContributors", () => {
  it("keeps User entries and drops Bot entries", () => {
    const result = parseContributors([USER_ENTRY, BOT_ENTRY]);
    expect(result).toEqual([
      {
        login: "mariokreitz",
        avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
        profileUrl: "https://github.com/mariokreitz",
        contributions: 120,
      },
    ]);
  });

  it("caps the result at the given count, preserving input order", () => {
    const entries = Array.from({ length: 5 }, (_, i) => ({
      ...USER_ENTRY,
      login: `contributor-${i}`,
    }));
    const result = parseContributors(entries, 2);
    expect(result.map((c) => c.login)).toEqual(["contributor-0", "contributor-1"]);
  });

  it("skips malformed entries instead of throwing", () => {
    const result = parseContributors([{ login: "incomplete" }, USER_ENTRY]);
    expect(result).toEqual([
      {
        login: "mariokreitz",
        avatarUrl: "https://avatars.githubusercontent.com/u/1?v=4",
        profileUrl: "https://github.com/mariokreitz",
        contributions: 120,
      },
    ]);
  });

  it("returns an empty array when the response is not an array", () => {
    expect(parseContributors({ message: "Not Found" })).toEqual([]);
    expect(parseContributors(null)).toEqual([]);
  });
});

describe("fetchContributors", () => {
  it("returns the parsed contributor list on a successful response", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve([USER_ENTRY, BOT_ENTRY]),
    });

    const result = await fetchContributors(24, { fetch: fetchMock });

    expect(result).toHaveLength(1);
    expect(result[0]?.login).toBe("mariokreitz");
  });

  it("returns an empty array without throwing when the request fails", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));

    const result = await fetchContributors(24, { fetch: fetchMock });

    expect(result).toEqual([]);
  });

  it("returns an empty array without throwing when the response is not ok", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve([]) });

    const result = await fetchContributors(24, { fetch: fetchMock });

    expect(result).toEqual([]);
  });

  it("omits the Authorization header when GITHUB_TOKEN is unset", async () => {
    delete process.env.GITHUB_TOKEN;
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

    await fetchContributors(24, { fetch: fetchMock });

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(init.headers.Authorization).toBeUndefined();
  });

  it("sends a Bearer Authorization header when GITHUB_TOKEN is set", async () => {
    process.env.GITHUB_TOKEN = "test-token";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

    await fetchContributors(24, { fetch: fetchMock });

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { headers: Record<string, string> },
    ];
    expect(init.headers.Authorization).toBe("Bearer test-token");
  });

  it("requests a day-scale ISR revalidation window rather than per-request fetching", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve([]) });

    await fetchContributors(24, { fetch: fetchMock });

    const [, init] = fetchMock.mock.calls[0] as [string, { next?: { revalidate?: number } }];
    expect(init.next?.revalidate).toBeGreaterThanOrEqual(60 * 60 * 24);
  });
});
