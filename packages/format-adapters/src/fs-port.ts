import { type FileHandle, mkdir, open, rename, rm, writeFile } from "node:fs/promises";
import { type AtomicWriteOps, atomicWriteFile } from "./json/atomic-write.js";

/**
 * The outcome of a size-bounded read through the {@link AdapterFs} port. A path that is not a file,
 * or a file larger than the caller's limit, is reported as a state rather than thrown, so an adapter
 * can treat "no file yet" and "too large to trust" as ordinary branches.
 */
export type BoundedReadOutcome =
  | { readonly kind: "ok"; readonly content: string }
  | { readonly kind: "not-a-file" }
  | { readonly kind: "too-large" };

/**
 * The file-system port every format adapter reads and writes through. An adapter that takes this
 * port instead of importing `node:fs` can be tested against an in-memory implementation and stays
 * honest about every path it touches.
 *
 * This is the supported path for an adapter shipped outside verbatra, and the one verbatra hands it.
 * It is a convention, not a sandbox: nothing stops third-party code from reaching the file system
 * another way.
 */
export interface AdapterFs {
  /**
   * Read a UTF-8 text file, refusing anything larger than the caller's limit.
   *
   * @param path - The file to read.
   * @param maxBytes - The largest file size to read; a larger file yields `too-large` and is not read.
   * @returns The file's content, or the state that prevented reading it.
   */
  readBounded(path: string, maxBytes: number): Promise<BoundedReadOutcome>;
  /**
   * Write a UTF-8 text file atomically, creating missing parent directories.
   *
   * @param path - The destination file.
   * @param data - The content to write.
   * @returns Nothing, once the content is durably in place under `path`.
   */
  writeFileAtomic(path: string, data: string): Promise<void>;
}

async function readUtf8(handle: FileHandle, size: number): Promise<string> {
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

async function nodeReadBounded(path: string, maxBytes: number): Promise<BoundedReadOutcome> {
  const handle = await open(path, "r");
  try {
    const info = await handle.stat();
    if (!info.isFile()) {
      return { kind: "not-a-file" };
    }
    if (info.size > maxBytes) {
      return { kind: "too-large" };
    }
    return { kind: "ok", content: await readUtf8(handle, info.size) };
  } finally {
    await handle.close();
  }
}

async function fsyncPath(path: string): Promise<void> {
  const handle = await open(path, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

async function fsyncDirBestEffort(path: string): Promise<void> {
  try {
    await fsyncPath(path);
  } catch {}
}

export const nodeOps: AtomicWriteOps = {
  mkdir: async (path) => {
    await mkdir(path, { recursive: true });
  },
  writeFile: (path, data) => writeFile(path, data, "utf8"),
  fsyncFile: (path) => fsyncPath(path),
  rename: (from, to) => rename(from, to),
  fsyncDir: (path) => fsyncDirBestEffort(path),
  rm: (path) => rm(path, { force: true }),
};

/**
 * The {@link AdapterFs} implementation backed by the real file system, and the default every adapter
 * factory uses when no port is supplied. It writes through a temporary file and a rename, so an
 * interrupted write never leaves a half-finished locale file.
 *
 * @example
 * ```ts
 * const adapter = createFlatFileAdapter({ ...options, fs: nodeAdapterFs });
 * ```
 */
export const nodeAdapterFs: AdapterFs = {
  readBounded: nodeReadBounded,
  writeFileAtomic: (path, data) => atomicWriteFile(path, data, nodeOps),
};
