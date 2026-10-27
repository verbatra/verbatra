import { join } from "node:path";
import type { AdapterRegistry } from "@verbatra/format-adapters";
import type { DirectoryEntry, SdkFs } from "../fs.js";
import { safeResolve } from "./format-evidence.js";

export const MAX_SCAN_DEPTH = 8;

export const MAX_SCAN_ENTRIES = 20_000;

const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([
  "node_modules",
  "bower_components",
  "jspm_packages",
  "vendor",
  "dist",
  "build",
  "out",
  "coverage",
  "target",
  "bin",
  "obj",
  "tmp",
  "temp",
  "Pods",
  "DerivedData",
  "__pycache__",
]);

export interface LocaleFileScan {
  readonly files: readonly string[];
  readonly truncated: boolean;
  readonly skippedOther: number;
}

interface ScanState {
  readonly readDirectory: ReadDirectory;
  readonly registry: AdapterRegistry;
  readonly cwd: string;
  readonly files: string[];
  visited: number;
  truncated: boolean;
  skippedOther: number;
}

function isSkippedDirectory(name: string): boolean {
  return name.startsWith(".") || SKIPPED_DIRECTORIES.has(name);
}

function isClaimedByAnyAdapter(registry: AdapterRegistry, path: string): boolean {
  const resolution = safeResolve(registry, path);
  return resolution !== undefined && resolution.status !== "no-match";
}

type ReadDirectory = (path: string) => Promise<readonly DirectoryEntry[]>;

function compareNames(a: DirectoryEntry, b: DirectoryEntry): number {
  if (a.name === b.name) {
    return 0;
  }
  return a.name < b.name ? -1 : 1;
}

async function listDirectory(
  readDirectory: ReadDirectory,
  path: string,
): Promise<readonly DirectoryEntry[]> {
  try {
    return await readDirectory(path);
  } catch {
    return [];
  }
}

interface PendingDirectory {
  readonly path: string;
  readonly depth: number;
}

function visitEntry(
  state: ScanState,
  entry: DirectoryEntry,
  parent: PendingDirectory,
  queue: PendingDirectory[],
): void {
  const relativePath = parent.path === "" ? entry.name : `${parent.path}/${entry.name}`;
  if (entry.kind === "file") {
    if (isClaimedByAnyAdapter(state.registry, relativePath)) {
      state.files.push(relativePath);
    }
  } else if (entry.kind === "other") {
    state.skippedOther += 1;
  } else if (!isSkippedDirectory(entry.name)) {
    if (parent.depth >= MAX_SCAN_DEPTH) {
      state.truncated = true;
    } else {
      queue.push({ path: relativePath, depth: parent.depth + 1 });
    }
  }
}

async function walk(state: ScanState): Promise<void> {
  const queue: PendingDirectory[] = [{ path: "", depth: 0 }];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const entries = await listDirectory(state.readDirectory, join(state.cwd, next.path));
    for (const entry of [...entries].sort(compareNames)) {
      if (state.visited >= MAX_SCAN_ENTRIES) {
        state.truncated = true;
        return;
      }
      state.visited += 1;
      visitEntry(state, entry, next, queue);
    }
  }
}

export async function scanLocaleFiles(
  cwd: string,
  fs: SdkFs,
  registry: AdapterRegistry,
): Promise<LocaleFileScan | undefined> {
  const readDirectory = fs.readDirectory;
  if (readDirectory === undefined) {
    return undefined;
  }
  const state: ScanState = {
    readDirectory: readDirectory.bind(fs),
    registry,
    cwd,
    files: [],
    visited: 0,
    truncated: false,
    skippedOther: 0,
  };
  await walk(state);
  return { files: state.files, truncated: state.truncated, skippedOther: state.skippedOther };
}
