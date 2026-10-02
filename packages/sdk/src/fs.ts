import { randomUUID } from "node:crypto";
import { type Dirent, readFileSync, readlinkSync } from "node:fs";
import {
  access,
  type FileHandle,
  mkdir,
  open,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  utimes,
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
  /**
   * Resolves every symbolic link in an existing path and returns the canonical absolute path.
   * Optional, so an implementation written before it existed keeps compiling. The output guards of
   * {@link generateTypes}, {@link exportTmx}, {@link exportWorkbook}, and {@link pseudolocalize} use
   * it to see where a path really lands, so a symbolic link cannot carry an output file outside the
   * working directory or onto a file the project depends on. Without it, those guards compare paths
   * as written. A symbolic link at the output path whose target does not exist cannot be resolved,
   * so the guards assume {@link SdkFs.writeFile} and {@link SdkFs.writeBytes} replace a link there
   * rather than writing through it, as the default atomic write does.
   *
   * @param path - An existing file or directory.
   * @returns The canonical absolute path. Rejects when the path does not exist.
   */
  realpath?(path: string): Promise<string>;
  /**
   * Moves the file at `from` to `to` in one atomic step, replacing any file already at `to`. The
   * SDK only ever renames within one directory. Optional, so an implementation written before it
   * existed keeps compiling.
   *
   * The write lock uses it to remove a lock or reclaim guard left by a process that is gone, and to
   * release its own lock: it moves the file aside under a unique
   * `<name>.<pid>.<host tag>.<uuid>.stale` name and deletes it only when what it moved is the record
   * it expected. Anything else, such as a lock another process took in the meantime, is put back
   * with {@link SdkFs.createExclusive}; a record that cannot be put back because a third process
   * took the path in the meantime is deleted, since its holder's ownership check fails from then on.
   * An abandoned reclaim guard is cleared only after it is seen unchanged across two polls, and only
   * when its recorded process is gone: a guard records no heartbeat.
   *
   * A reclaim rename that fails with `EPERM`, `EBUSY`, or `EACCES`, as Windows reports for a file
   * another process has open, is treated as "not reclaimed this poll" and retried until the lock
   * timeout. A release rename that fails for any reason falls back to reading the lock file and
   * deleting it when it still holds this holder's token, and that fallback retries a failure with
   * one of those three codes a few times, a poll apart, before it gives up.
   *
   * Each lock records a random ownership token, and before every write it protects the holder checks
   * that the lock file still holds its token, failing with `LOCK_CONTENDED` and writing nothing when
   * it does not. That check and the write are two steps, and nothing bounds the time between them:
   * a holder paused after the check (a sleeping machine, a stopped process, a debugger, a clock
   * step, or a long block of its event loop) can have its lock judged abandoned once its heartbeat
   * is three intervals old (30 seconds by default), and still write once when it resumes, after
   * another process took the lock over. Without `rename`, the lock reads the file and deletes it
   * when unchanged, a second such window.
   *
   * A `.stale` file left in `.verbatra-local/locks` by a process that crashed mid-move is safe to
   * delete by hand; the next lock acquisition deletes it once the process that moved it is gone, or,
   * on a file system that implements {@link SdkFs.touch}, once it is older than the stale threshold,
   * measured from the move.
   *
   * @param from - The file to move.
   * @param to - Its new path, in the same directory.
   * @returns Resolves once the file is at `to`. Rejects with an error whose `code` is `ENOENT` when
   * no file exists at `from`.
   */
  rename?(from: string, to: string): Promise<void>;
  /**
   * Sets the modification time of an existing file to the current time of this process's clock,
   * not the file server's. Optional. Together with {@link SdkFs.mtimeMs} it is the write lock's
   * heartbeat: a holder whose file system implements `touch` records a heartbeat interval (10
   * seconds) in its lock, touches the lock file right after creating it, and refreshes its
   * modification time at that interval while it holds the lock. A file moved aside is touched too,
   * so its age counts from the move.
   *
   * @param path - The file to touch.
   * @returns Resolves once the modification time is updated. Rejects when no file exists at the
   * path.
   */
  touch?(path: string): Promise<void>;
  /**
   * Reads a file's modification time. Optional. A waiting process whose file system implements it
   * treats a lock on its own machine whose holder recorded a heartbeat interval but has not
   * refreshed the file for three intervals (30 seconds by default) as abandoned, even when the
   * recorded process is still running, such as a long-lived Studio, `watch`, or MCP server whose
   * lock record outlived its hold. Without `touch` and `mtimeMs`, a lock is judged abandoned only
   * when its recorded process is provably gone.
   *
   * @param path - The file to inspect.
   * @returns The modification time in milliseconds since the Unix epoch, or `undefined` when no
   * file exists at the path.
   */
  mtimeMs?(path: string): Promise<number | undefined>;
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
  realpath: (path: string): Promise<string> => realpath(path),
  rename: (from: string, to: string): Promise<void> => rename(from, to),
  touch: async (path: string): Promise<void> => {
    const now = new Date();
    await utimes(path, now, now);
  },
  mtimeMs: async (path: string): Promise<number | undefined> => {
    try {
      return (await stat(path)).mtimeMs;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return undefined;
      }
      throw error;
    }
  },
  readDirectory: async (path: string): Promise<readonly DirectoryEntry[]> => {
    const entries = await readdir(path, { withFileTypes: true });
    return entries.map((entry) => ({ name: entry.name, kind: entryKind(entry) }));
  },
};

export interface KernelIdentity {
  readonly bootId?: string;
  readonly pidNamespace?: string;
}

const MAX_KERNEL_IDENTITY_LENGTH = 256;

function readIdentityValue(read: () => string): string | undefined {
  try {
    const value = read().trim();
    return value.length > 0 && value.length <= MAX_KERNEL_IDENTITY_LENGTH ? value : undefined;
  } catch {
    return undefined;
  }
}

export function readKernelIdentity(procRoot = "/proc"): KernelIdentity {
  const bootId = readIdentityValue(() =>
    readFileSync(join(procRoot, "sys", "kernel", "random", "boot_id"), "utf8"),
  );
  const pidNamespace = readIdentityValue(() => readlinkSync(join(procRoot, "self", "ns", "pid")));
  return {
    ...(bootId !== undefined ? { bootId } : {}),
    ...(pidNamespace !== undefined ? { pidNamespace } : {}),
  };
}
