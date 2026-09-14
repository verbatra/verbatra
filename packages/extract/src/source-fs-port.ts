import type { Dirent } from "node:fs";
import { type FileHandle, open, readdir } from "node:fs/promises";

export type DirectoryEntryKind = "file" | "directory" | "other";

/**
 * One entry in a directory listing. A symbolic link is reported as `other` and never followed,
 * which is what keeps a scan inside the roots it was given.
 */
export interface DirectoryEntry {
  /** The entry's own name, with no directory part. */
  readonly name: string;
  /** What the entry is. Anything that is not a regular file or a directory is `other`. */
  readonly kind: DirectoryEntryKind;
}

/**
 * The outcome of a size-bounded source-file read. An absent or oversized file is a state rather
 * than a thrown error, so one unreadable file never aborts a scan.
 */
export type BoundedSourceRead =
  | { readonly kind: "ok"; readonly content: string }
  | { readonly kind: "missing" }
  | { readonly kind: "too-large" };

/**
 * The file-system port a source scan goes through. Nothing in this package imports `node:fs`
 * directly, so supplying your own implementation redirects every read the scan performs.
 */
export interface SourceFs {
  /** Lists one directory's immediate entries, without recursing and without following symlinks. */
  listDirectory(path: string): Promise<readonly DirectoryEntry[]>;
  /** Reads a file as UTF-8 text, refusing to read more than `maxBytes`. */
  readTextBounded(path: string, maxBytes: number): Promise<BoundedSourceRead>;
}

function entryKind(entry: Dirent): DirectoryEntryKind {
  if (entry.isFile()) {
    return "file";
  }
  return entry.isDirectory() ? "directory" : "other";
}

async function nodeListDirectory(path: string): Promise<readonly DirectoryEntry[]> {
  const entries = await readdir(path, { withFileTypes: true });
  return entries.map((entry) => ({ name: entry.name, kind: entryKind(entry) }));
}

async function readUtf8(handle: FileHandle, size: number): Promise<string> {
  const buffer = Buffer.allocUnsafe(size);
  let offset = 0;
  while (offset < size) {
    const { bytesRead } = await handle.read(buffer, offset, size - offset, offset);
    /* v8 ignore next 3 */
    if (bytesRead === 0) {
      break;
    }
    offset += bytesRead;
  }
  return buffer.toString("utf8", 0, offset);
}

async function nodeReadTextBounded(path: string, maxBytes: number): Promise<BoundedSourceRead> {
  let handle: FileHandle;
  try {
    handle = await open(path, "r");
  } catch {
    return { kind: "missing" };
  }
  try {
    const info = await handle.stat();
    if (!info.isFile()) {
      return { kind: "missing" };
    }
    if (info.size > maxBytes) {
      return { kind: "too-large" };
    }
    return { kind: "ok", content: await readUtf8(handle, info.size) };
  } finally {
    await handle.close();
  }
}

export const nodeSourceFs: SourceFs = {
  listDirectory: nodeListDirectory,
  readTextBounded: nodeReadTextBounded,
};
