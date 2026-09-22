import { randomUUID } from "node:crypto";
import type { Dirent } from "node:fs";
import {
  access,
  type FileHandle,
  mkdir,
  open,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { basename, dirname, join } from "node:path";

/**
 * The outcome of a size-bounded text read. A file that is absent or larger than the caller's limit
 * is reported as a state rather than thrown, so a caller can treat "no file yet" as normal and an
 * oversized file as a distinct, actionable condition.
 */
export type BoundedFileRead =
  | {
      /** The file was read in full. */
      readonly kind: "ok";
      /** The file's content, decoded as UTF-8. */
      readonly content: string;
    }
  | {
      /** No readable file exists at the path. */
      readonly kind: "missing";
    }
  | {
      /** The file exists but exceeds the requested byte limit, so nothing was read. */
      readonly kind: "too-large";
    };

/**
 * The outcome of a size-bounded binary read, used for interchange workbooks. Mirrors
 * {@link BoundedFileRead} but yields raw bytes rather than decoded text.
 */
export type BoundedBytesRead =
  | {
      /** The file was read in full. */
      readonly kind: "ok";
      /** The file's raw bytes. */
      readonly bytes: Uint8Array;
    }
  | {
      /** No readable file exists at the path. */
      readonly kind: "missing";
    }
  | {
      /** The file exists but exceeds the requested byte limit, so nothing was read. */
      readonly kind: "too-large";
    };

/**
 * What one entry in a directory listing is: a regular file, a directory, or anything else. A
 * symbolic link is reported as `other`, never followed, which is what keeps a source scan inside
 * the roots it was given.
 */
export interface DirectoryEntry {
  /** The entry's own name, with no directory part. */
  readonly name: string;
  /** What the entry is. Anything that is not a regular file or a directory is `other`. */
  readonly kind: "file" | "directory" | "other";
}

/**
 * The file-system port the SDK's own I/O goes through. Supplying your own implementation as a
 * `deps.fs` option redirects that I/O, which is how the SDK's tests avoid touching disk and how an
 * embedding application can back part of a project with something other than a local disk.
 *
 * The seam carries every file the SDK touches once a config is loaded: the run-status file, the
 * lock-file and the write locks, the translation-memory cache, the config glossary, workbook and TMX
 * I/O, generated declaration and pseudolocale files, the source scan, and the locale files
 * themselves, which the adapters read and write through a port built from this one. Two exceptions
 * remain. {@link loadConfig} finds and loads the config file itself directly from disk; only its
 * glossary goes through the port. And a caller-supplied `deps.adapterRegistry` holds adapters the
 * caller constructed, so their file access is whatever the caller wired into them, and supplying
 * both means the caller owns that wiring.
 *
 * Reads are size-bounded by contract so that a hostile or accidentally huge file cannot exhaust
 * memory. Writes are expected to be atomic: the default implementation writes to a temporary file
 * and renames it into place, so a crash mid-write never leaves a half-written file behind.
 * Directory creation is the caller's job, so an implementation whose `writeFile` targets a real
 * directory tree must also implement `mkdir`.
 */
export interface SdkFs {
  /** Reports whether a file exists at the path. The default implementation checks existence only. */
  fileExists(path: string): Promise<boolean>;
  /** Reads a file as UTF-8 text, refusing to read more than `maxBytes`. */
  readFileBounded(path: string, maxBytes: number): Promise<BoundedFileRead>;
  /** Reads a file as raw bytes, refusing to read more than `maxBytes`. */
  readBytesBounded(path: string, maxBytes: number): Promise<BoundedBytesRead>;
  /** Writes UTF-8 text to the path, replacing any existing file atomically. */
  writeFile(path: string, data: string): Promise<void>;
  /** Writes raw bytes to the path, replacing any existing file atomically. */
  writeBytes(path: string, data: Uint8Array): Promise<void>;
  /**
   * Creates a file only if it does not already exist, returning `false` when it does. This is the
   * primitive behind the per-locale write lock, so it must be atomic against other processes.
   */
  createExclusive(path: string, data: string): Promise<boolean>;
  /** Removes the file at the path, succeeding even when it is already absent. */
  deleteFile(path: string): Promise<void>;
  /** Creates a directory and any missing parents. Optional; omit it if the backing store has no directories. */
  mkdir?(path: string): Promise<void>;
  /**
   * Lists one directory's immediate entries, without recursing and without following symbolic
   * links. Optional, so an implementation written before source extraction existed keeps working;
   * {@link extract} is the only entry point that needs it and reports its absence as
   * `EXTRACT_FS_UNSUPPORTED`.
   *
   * @param path - The directory to list.
   * @returns Every immediate entry with its kind. Rejects when the path is not a readable directory.
   */
  readDirectory?(path: string): Promise<readonly DirectoryEntry[]>;
}

function entryKind(entry: Dirent): DirectoryEntry["kind"] {
  if (entry.isFile()) {
    return "file";
  }
  return entry.isDirectory() ? "directory" : "other";
}

async function readBoundedUtf8(handle: FileHandle, size: number): Promise<string> {
  const buffer = Buffer.allocUnsafe(size);
  let offset = 0;
  while (offset < size) {
    const { bytesRead } = await handle.read(buffer, offset, size - offset, offset);
    if (bytesRead === 0) {
      break;
    }
    offset += bytesRead;
  }
  return buffer.toString("utf8", 0, offset);
}

async function readBounded(path: string, maxBytes: number): Promise<BoundedFileRead> {
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
    return { kind: "ok", content: await readBoundedUtf8(handle, info.size) };
  } finally {
    await handle.close();
  }
}

async function readBoundedBytesInto(handle: FileHandle, size: number): Promise<Uint8Array> {
  const buffer = Buffer.allocUnsafeSlow(size);
  let offset = 0;
  while (offset < size) {
    const { bytesRead } = await handle.read(buffer, offset, size - offset, offset);
    if (bytesRead === 0) {
      break;
    }
    offset += bytesRead;
  }
  return new Uint8Array(buffer.buffer, buffer.byteOffset, offset);
}

async function readBoundedBytes(path: string, maxBytes: number): Promise<BoundedBytesRead> {
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
    return { kind: "ok", bytes: await readBoundedBytesInto(handle, info.size) };
  } finally {
    await handle.close();
  }
}

export function tempFileName(path: string): string {
  return join(dirname(path), `.${basename(path)}.tmp-${process.pid}-${Date.now()}-${randomUUID()}`);
}

async function atomicWrite(path: string, data: string | Uint8Array): Promise<void> {
  const tmp = tempFileName(path);
  await (typeof data === "string" ? writeFile(tmp, data, "utf8") : writeFile(tmp, data));
  try {
    await rename(tmp, path);
  } catch (error) {
    await rm(tmp, { force: true });
    throw error;
  }
}

async function createExclusive(path: string, data: string): Promise<boolean> {
  await mkdir(dirname(path), { recursive: true });
  let handle: FileHandle;
  try {
    handle = await open(path, "wx");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      return false;
    }
    throw error;
  }
  try {
    await handle.writeFile(data, "utf8");
  } finally {
    await handle.close();
  }
  return true;
}

export const defaultFs: SdkFs = {
  async fileExists(path: string): Promise<boolean> {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  },
  readFileBounded: (path: string, maxBytes: number): Promise<BoundedFileRead> =>
    readBounded(path, maxBytes),
  readBytesBounded: (path: string, maxBytes: number): Promise<BoundedBytesRead> =>
    readBoundedBytes(path, maxBytes),
  writeFile: (path: string, data: string): Promise<void> => atomicWrite(path, data),
  writeBytes: (path: string, data: Uint8Array): Promise<void> => atomicWrite(path, data),
  createExclusive: (path: string, data: string): Promise<boolean> => createExclusive(path, data),
  deleteFile: async (path: string): Promise<void> => {
    await rm(path, { force: true });
  },
  mkdir: async (path: string): Promise<void> => {
    await mkdir(path, { recursive: true });
  },
  readDirectory: async (path: string): Promise<readonly DirectoryEntry[]> => {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.map((entry) => ({ name: entry.name, kind: entryKind(entry) }));
  },
};
