import type { FormatId, LocaleResource } from "@verbatra/core";
import { type AdapterFs, createDefaultRegistry } from "@verbatra/format-adapters";
import { COMMIT_HASH, type GitFailure } from "./git-exec.js";
import { type GitWorkTree, type LocaleGitUnavailableReason, unavailable } from "./git-worktree.js";

/** The largest committed locale file {@link localeGitDiff} reads, in bytes: 8 MiB. */
export const LOCALE_GIT_BLOB_MAX_BYTES = 8_388_608;

const REGULAR_FILE_MODES: ReadonlySet<string> = new Set(["100644", "100755"]);
const TREE_ENTRY = /^(\d{6}) (\w+) ([0-9a-f]{40,64}) +(-|\d+|BAD)\t([\s\S]*)$/;

export function blobSpec(hash: string, repoPath: string): string | undefined {
  const segments = repoPath.split("/");
  const clean =
    repoPath.length > 0 &&
    !repoPath.startsWith("/") &&
    segments.every((segment) => segment !== "" && segment !== "." && segment !== "..");
  return COMMIT_HASH.test(hash) && clean ? `${hash}:${repoPath}` : undefined;
}

export type BlobRead =
  | { readonly kind: "ok"; readonly content: string }
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "failed"; readonly reason: LocaleGitUnavailableReason };

interface TreeEntry {
  readonly mode: string;
  readonly type: string;
  readonly size: number;
}

function parseTreeEntry(stdout: string, repoPath: string): TreeEntry | undefined {
  for (const raw of stdout.split("\0")) {
    const match = TREE_ENTRY.exec(raw);
    if (match !== null && match[5] === repoPath) {
      return { mode: match[1] as string, type: match[2] as string, size: Number(match[4]) };
    }
  }
  return undefined;
}

type BlobFailure = Extract<BlobRead, { readonly kind: "unreadable" | "failed" }>;

function failedRead(failure: GitFailure): BlobFailure {
  return failure.kind === "git-failed"
    ? { kind: "unreadable" }
    : { kind: "failed", reason: unavailable(failure).reason };
}

export async function readBlobAtHead(tree: GitWorkTree, repoPath: string): Promise<BlobRead> {
  if (tree.head === undefined) {
    return { kind: "absent" };
  }
  return readBlobAtCommit(tree, tree.head, repoPath);
}

export type BlobStat =
  | { readonly kind: "sized"; readonly size: number }
  | { readonly kind: "absent" }
  | { readonly kind: "unreadable" }
  | { readonly kind: "failed"; readonly reason: LocaleGitUnavailableReason };

export async function statBlobAtCommit(
  tree: GitWorkTree,
  commit: string,
  repoPath: string,
): Promise<BlobStat> {
  if (blobSpec(commit, repoPath) === undefined) {
    return { kind: "unreadable" };
  }
  const listed = await tree.runner.run([
    "ls-tree",
    "-z",
    "--long",
    "--full-tree",
    commit,
    "--",
    repoPath,
  ]);
  if (!listed.ok) {
    return failedRead(listed.failure);
  }
  const entry = parseTreeEntry(listed.stdout, repoPath);
  if (entry === undefined) {
    return { kind: "absent" };
  }
  if (entry.type !== "blob" || !REGULAR_FILE_MODES.has(entry.mode) || Number.isNaN(entry.size)) {
    return { kind: "unreadable" };
  }
  return { kind: "sized", size: entry.size };
}

export async function readBlobBody(
  tree: GitWorkTree,
  commit: string,
  repoPath: string,
  maxBytes: number = LOCALE_GIT_BLOB_MAX_BYTES,
): Promise<BlobRead> {
  const spec = blobSpec(commit, repoPath);
  if (spec === undefined) {
    return { kind: "unreadable" };
  }
  const blob = await tree.runner.run(["cat-file", "blob", spec], {
    maxBuffer: Math.min(maxBytes, LOCALE_GIT_BLOB_MAX_BYTES),
  });
  return blob.ok ? { kind: "ok", content: blob.stdout } : failedRead(blob.failure);
}

export async function readBlobAtCommit(
  tree: GitWorkTree,
  commit: string,
  repoPath: string,
): Promise<BlobRead> {
  const stat = await statBlobAtCommit(tree, commit, repoPath);
  if (stat.kind !== "sized") {
    return stat;
  }
  if (stat.size > LOCALE_GIT_BLOB_MAX_BYTES) {
    return { kind: "failed", reason: "output-too-large" };
  }
  return readBlobBody(tree, commit, repoPath);
}

function missing(path: string): Error {
  return Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), {
    code: "ENOENT",
  });
}

export function memoryFileFs(files: ReadonlyMap<string, string>): AdapterFs {
  return {
    async readBounded(path, maxBytes) {
      const content = files.get(path);
      if (content === undefined) {
        throw missing(path);
      }
      return Buffer.byteLength(content, "utf8") > maxBytes
        ? { kind: "too-large" }
        : { kind: "ok", content };
    },
    async writeFileAtomic() {
      throw new Error("The revision file system is read-only.");
    },
  };
}

export function singleFileFs(servedPath: string, content: string): AdapterFs {
  return memoryFileFs(new Map([[servedPath, content]]));
}

export interface ParseRevisionInput {
  readonly format: FormatId;
  readonly locale: string;
  readonly absolutePath: string;
  readonly content: string;
  readonly siblings?: ReadonlyMap<string, string>;
}

export async function parseRevisionContent(
  input: ParseRevisionInput,
): Promise<LocaleResource | undefined> {
  const registry = createDefaultRegistry(
    memoryFileFs(new Map([...(input.siblings ?? []), [input.absolutePath, input.content]])),
  );
  const resolution = registry.resolve("", { format: input.format });
  if (resolution.status !== "resolved") {
    return undefined;
  }
  try {
    return (await resolution.adapter.read(input.absolutePath, input.locale)).resource;
  } catch {
    return undefined;
  }
}
