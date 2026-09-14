import type { Dirent } from "node:fs";
import { type FileHandle, open, readdir } from "node:fs/promises";

export type DirectoryEntryKind = "file" | "directory" | "other";

export interface DirectoryEntry {
  readonly name: string;
  readonly kind: DirectoryEntryKind;
}

export type BoundedSourceRead =
  | { readonly kind: "ok"; readonly content: string }
  | { readonly kind: "missing" }
  | { readonly kind: "too-large" };

export interface SourceFs {
  listDirectory(path: string): Promise<readonly DirectoryEntry[]>;
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
