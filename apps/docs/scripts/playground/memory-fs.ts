import type {
  AdapterFs,
  BoundedBytesRead,
  BoundedFileRead,
  BoundedReadOutcome,
  DirectoryEntry,
  SdkFs,
} from "@verbatra/sdk";

export interface MemoryStore {
  readonly files: Map<string, string>;
  readonly sdkFs: SdkFs;
  readonly adapterFs: AdapterFs;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function missingFile(path: string): Error {
  return Object.assign(new Error(`ENOENT: no such file in the playground store, ${path}`), {
    code: "ENOENT",
  });
}

function byteLength(content: string): number {
  return encoder.encode(content).byteLength;
}

function childEntries(files: Map<string, string>, directory: string): DirectoryEntry[] {
  const prefix = directory.endsWith("/") ? directory : `${directory}/`;
  const entries = new Map<string, DirectoryEntry["kind"]>();
  for (const path of files.keys()) {
    if (!path.startsWith(prefix)) {
      continue;
    }
    const [name = "", ...rest] = path.slice(prefix.length).split("/");
    entries.set(name, rest.length === 0 ? "file" : "directory");
  }
  return [...entries].map(([name, kind]) => ({ name, kind }));
}

function createSdkFs(files: Map<string, string>): SdkFs {
  return {
    fileExists: async (path) => files.has(path),
    readFileBounded: async (path, maxBytes): Promise<BoundedFileRead> => {
      const content = files.get(path);
      if (content === undefined) {
        return { kind: "missing" };
      }
      return byteLength(content) > maxBytes ? { kind: "too-large" } : { kind: "ok", content };
    },
    readBytesBounded: async (path, maxBytes): Promise<BoundedBytesRead> => {
      const content = files.get(path);
      if (content === undefined) {
        return { kind: "missing" };
      }
      const bytes = encoder.encode(content);
      return bytes.byteLength > maxBytes ? { kind: "too-large" } : { kind: "ok", bytes };
    },
    writeFile: async (path, data) => {
      files.set(path, data);
    },
    writeBytes: async (path, data) => {
      files.set(path, decoder.decode(data));
    },
    createExclusive: async (path, data) => {
      if (files.has(path)) {
        return false;
      }
      files.set(path, data);
      return true;
    },
    deleteFile: async (path) => {
      files.delete(path);
    },
    mkdir: async () => {},
    readDirectory: async (path) => childEntries(files, path),
    rename: async (from, to) => {
      const content = files.get(from);
      if (content === undefined) {
        throw missingFile(from);
      }
      files.set(to, content);
      files.delete(from);
    },
  };
}

function createAdapterFs(files: Map<string, string>): AdapterFs {
  return {
    readBounded: async (path, maxBytes): Promise<BoundedReadOutcome> => {
      const content = files.get(path);
      if (content === undefined) {
        throw missingFile(path);
      }
      return byteLength(content) > maxBytes ? { kind: "too-large" } : { kind: "ok", content };
    },
    writeFileAtomic: async (path, data) => {
      files.set(path, data);
    },
  };
}

export function createMemoryStore(initial: Readonly<Record<string, string>>): MemoryStore {
  const files = new Map(Object.entries(initial));
  return { files, sdkFs: createSdkFs(files), adapterFs: createAdapterFs(files) };
}
