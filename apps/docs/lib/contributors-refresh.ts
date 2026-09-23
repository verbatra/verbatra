import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Contributor } from "./contributors";

export const CONTRIBUTORS_URL = "https://api.github.com/repos/verbatra/verbatra/contributors";
export const CONTRIBUTORS_CAP = 24;
const AVATAR_PIXELS = 64;
const AVATAR_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const githubContributorSchema = z.object({
  login: z.string().regex(/^[A-Za-z0-9-]+$/),
  avatar_url: z.url(),
  html_url: z.string(),
  type: z.string(),
});

export type ContributorSource = {
  login: string;
  avatarUrl: string;
  profileUrl: string;
};

export type RefreshContributorsOptions = {
  avatarDir: string;
  manifestPath: string;
  token?: string | undefined;
  cap?: number;
  fetch?: typeof fetch;
};

type DownloadedAvatar = { contributor: Contributor; bytes: Uint8Array; fileName: string };

export function parseContributors(
  data: unknown,
  cap: number = CONTRIBUTORS_CAP,
): ContributorSource[] {
  const list = z.array(z.unknown()).safeParse(data);
  if (!list.success) return [];

  const contributors: ContributorSource[] = [];
  for (const entry of list.data) {
    const parsed = githubContributorSchema.safeParse(entry);
    if (!parsed.success || parsed.data.type !== "User") continue;

    contributors.push({
      login: parsed.data.login,
      avatarUrl: parsed.data.avatar_url,
      profileUrl: parsed.data.html_url,
    });
    if (contributors.length >= cap) break;
  }
  return contributors;
}

export function avatarDownloadUrl(avatarUrl: string): string {
  const url = new URL(avatarUrl);
  url.searchParams.set("s", String(AVATAR_PIXELS));
  return url.toString();
}

function githubHeaders(token: string | undefined): Record<string, string> {
  const headers: Record<string, string> = { Accept: "application/vnd.github+json" };
  if (token !== undefined && token.length > 0) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

async function downloadAvatar(
  source: ContributorSource,
  doFetch: typeof fetch,
): Promise<DownloadedAvatar> {
  const response = await doFetch(avatarDownloadUrl(source.avatarUrl));
  if (!response.ok) {
    throw new Error(`Avatar download for ${source.login} failed with status ${response.status}`);
  }
  const contentType = (response.headers.get("content-type") ?? "").split(";")[0]?.trim() ?? "";
  const extension = AVATAR_EXTENSIONS[contentType];
  if (extension === undefined) {
    throw new Error(`Avatar for ${source.login} has unsupported content type "${contentType}"`);
  }
  const fileName = `${source.login}.${extension}`;
  return {
    fileName,
    bytes: new Uint8Array(await response.arrayBuffer()),
    contributor: {
      login: source.login,
      avatarPath: `/contributors/${fileName}`,
      profileUrl: source.profileUrl,
    },
  };
}

export async function refreshContributors(
  options: RefreshContributorsOptions,
): Promise<Contributor[]> {
  const doFetch = options.fetch ?? fetch;
  const response = await doFetch(CONTRIBUTORS_URL, { headers: githubHeaders(options.token) });
  if (!response.ok) {
    throw new Error(`GitHub contributors request failed with status ${response.status}`);
  }
  const sources = parseContributors(await response.json(), options.cap ?? CONTRIBUTORS_CAP);

  const avatars: DownloadedAvatar[] = [];
  for (const source of sources) {
    avatars.push(await downloadAvatar(source, doFetch));
  }

  await rm(options.avatarDir, { recursive: true, force: true });
  await mkdir(options.avatarDir, { recursive: true });
  for (const avatar of avatars) {
    await writeFile(join(options.avatarDir, avatar.fileName), avatar.bytes);
  }
  const contributors = avatars.map((avatar) => avatar.contributor);
  await writeFile(options.manifestPath, `${JSON.stringify(contributors, null, 2)}\n`);
  return contributors;
}
