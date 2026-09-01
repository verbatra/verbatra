import { z } from "zod";

const CONTRIBUTORS_URL = "https://api.github.com/repos/verbatra/verbatra/contributors";
const CONTRIBUTORS_CAP = 24;
const ONE_DAY_IN_SECONDS = 60 * 60 * 24;

const githubContributorSchema = z.object({
  login: z.string(),
  avatar_url: z.string(),
  html_url: z.string(),
  contributions: z.number(),
  type: z.string(),
});

export type GithubContributor = {
  login: string;
  avatarUrl: string;
  profileUrl: string;
  contributions: number;
};

export type FetchContributorsDeps = {
  fetch?: typeof fetch;
};

export function parseContributors(
  data: unknown,
  cap: number = CONTRIBUTORS_CAP,
): GithubContributor[] {
  const list = z.array(z.unknown()).safeParse(data);
  if (!list.success) return [];

  const contributors: GithubContributor[] = [];
  for (const entry of list.data) {
    const parsed = githubContributorSchema.safeParse(entry);
    if (!parsed.success || parsed.data.type !== "User") continue;

    contributors.push({
      login: parsed.data.login,
      avatarUrl: parsed.data.avatar_url,
      profileUrl: parsed.data.html_url,
      contributions: parsed.data.contributions,
    });
    if (contributors.length >= cap) break;
  }
  return contributors;
}

export async function fetchContributors(
  cap: number = CONTRIBUTORS_CAP,
  deps: FetchContributorsDeps = {},
): Promise<GithubContributor[]> {
  const doFetch = deps.fetch ?? fetch;
  const token = process.env.GITHUB_TOKEN;
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (token !== undefined && token.length > 0) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await doFetch(CONTRIBUTORS_URL, {
      headers,
      next: { revalidate: ONE_DAY_IN_SECONDS },
    });
    if (!response.ok) return [];

    const data: unknown = await response.json();
    return parseContributors(data, cap);
  } catch {
    return [];
  }
}
