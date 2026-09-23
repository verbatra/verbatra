import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { Contributor } from "./contributors";

export const CONTRIBUTORS_URL = "https://api.github.com/repos/verbatra/verbatra/contributors";
export const CONTRIBUTORS_CAP = 24;
export const AVATAR_MAX_BYTES = 256 * 1024;
const AVATAR_PIXELS = 64;
const AVATAR_EXTENSIONS: Readonly<Record<string, string>> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

const githubContributorSchema = z.object({
  login: z.string(),
  avatar_url: z.string().regex(/^https:\/\/avatars\.githubusercontent\.com\//),
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
  validate: (data: unknown) => Contributor[];
  token?: string | undefined;
  cap?: number;
  fetch?: typeof fetch;
};

type DownloadedAvatar = { fileName: string; bytes: Uint8Array };

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

async function readCappedBody(response: Response, login: string): Promise<Uint8Array> {
  const tooLarge = new Error(`Avatar for ${login} exceeds ${AVATAR_MAX_BYTES} bytes`);
  if (Number(response.headers.get("content-length") ?? 0) > AVATAR_MAX_BYTES) throw tooLarge;
  if (response.body === null) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let total = 0;
  for await (const chunk of response.body) {
    total += chunk.byteLength;
    if (total > AVATAR_MAX_BYTES) throw tooLarge;
    chunks.push(chunk);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
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
  return {
    fileName: `${source.login}.${extension}`,
    bytes: await readCappedBody(response, source.login),
  };
}

async function replaceDirectory(
  target: string,
  files: ReadonlyArray<DownloadedAvatar>,
): Promise<void> {
  const staging = `${target}.staging`;
  const previous = `${target}.previous`;
  await rm(staging, { recursive: true, force: true });
  await rm(previous, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  for (const file of files) {
    await writeFile(join(staging, file.fileName), file.bytes);
  }
  await rename(target, previous).catch((error: NodeJS.ErrnoException) => {
    if (error.code !== "ENOENT") throw error;
  });
  await rename(staging, target);
  await rm(previous, { recursive: true, force: true });
}

async function replaceFile(target: string, content: string): Promise<void> {
  const staging = `${target}.staging`;
  await writeFile(staging, content);
  await rename(staging, target);
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
  const entries: Contributor[] = [];
  for (const source of sources) {
    const avatar = await downloadAvatar(source, doFetch);
    avatars.push(avatar);
    entries.push({
      login: source.login,
      avatarPath: `/contributors/${avatar.fileName}`,
      profileUrl: source.profileUrl,
    });
  }
  const contributors = options.validate(entries);

  await replaceDirectory(options.avatarDir, avatars);
  await replaceFile(options.manifestPath, `${JSON.stringify(contributors, null, 2)}\n`);
  return contributors;
}
