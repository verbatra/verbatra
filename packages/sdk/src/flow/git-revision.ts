import type { FormatId, LocaleResource } from "@verbatra/core";
import { type AdapterFs, createDefaultRegistry } from "@verbatra/format-adapters";
import { COMMIT_HASH } from "./git-exec.js";
import { type GitWorkTree, type LocaleGitUnavailableReason, unavailable } from "./git-worktree.js";

export const LOCALE_GIT_BLOB_MAX_BYTES = 8_388_608;

const REGULAR_FILE_MODES: ReadonlySet<string> = new Set(["100644", "100755"]);
const TREE_ENTRY = /^(\d{6}) (\w+) ([0-9a-f]{40,64}) +(-|\d+)\t([\s\S]*)$/;

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

export async function readBlobAtHead(tree: GitWorkTree, repoPath: string): Promise<BlobRead> {
  if (tree.head === undefined) {
    return { kind: "absent" };
  }
  const spec = blobSpec(tree.head, repoPath);
  if (spec === undefined) {
    return { kind: "unreadable" };
  }
  const listed = await tree.runner.run([
    "ls-tree",
    "-z",
    "--long",
    "--full-tree",
    tree.head,
    "--",
    repoPath,
  ]);
  if (!listed.ok) {
    return { kind: "failed", reason: unavailable(listed.failure).reason };
  }
  const entry = parseTreeEntry(listed.stdout, repoPath);
  if (entry === undefined) {
    return { kind: "absent" };
  }
  if (entry.type !== "blob" || !REGULAR_FILE_MODES.has(entry.mode)) {
    return { kind: "unreadable" };
  }
  if (entry.size > LOCALE_GIT_BLOB_MAX_BYTES) {
    return { kind: "failed", reason: "output-too-large" };
  }
  const blob = await tree.runner.run(["cat-file", "blob", spec], {
    maxBuffer: LOCALE_GIT_BLOB_MAX_BYTES + 1,
  });
  return blob.ok
    ? { kind: "ok", content: blob.stdout }
    : { kind: "failed", reason: unavailable(blob.failure).reason };
}

function missing(path: string): Error {
  return Object.assign(new Error(`ENOENT: no such file or directory, open '${path}'`), {
    code: "ENOENT",
  });
}

export function singleFileFs(servedPath: string, content: string): AdapterFs {
  return {
    async readBounded(path, maxBytes) {
      if (path !== servedPath) {
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

export interface ParseRevisionInput {
  readonly format: FormatId;
  readonly locale: string;
  readonly absolutePath: string;
  readonly content: string;
}

export async function parseRevisionContent(
  input: ParseRevisionInput,
): Promise<LocaleResource | undefined> {
  const registry = createDefaultRegistry(singleFileFs(input.absolutePath, input.content));
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
