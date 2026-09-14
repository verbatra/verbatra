import { relative } from "node:path";
import { discoverSourceFiles } from "./discovery.js";
import type { SourceExtractor } from "./extractor.js";
import { nodeSourceFs, type SourceFs } from "./source-fs-port.js";

export const DEFAULT_MAX_SOURCE_FILE_BYTES = 2_000_000;

/** Where something was found: a source file and a line inside it. Never a file's contents. */
export interface SourceLocation {
  /** The source file, relative to the run's working directory, with forward slashes. */
  readonly file: string;
  /** The one-based line number. */
  readonly line: number;
}

export interface ExtractedKey extends SourceLocation {
  readonly key: string;
  readonly value: string;
  readonly hasDefault: boolean;
}

/**
 * One key found at two or more call sites that disagree on its default value. Neither value is
 * written: resolving it last-write-wins would make the catalog depend on directory traversal order,
 * so the disagreement is reported for a person to settle at the call sites.
 */
export interface KeyConflict {
  /** The key the call sites disagree about. */
  readonly key: string;
  /** Every distinct default value found, in the order the scan met them. */
  readonly values: readonly string[];
  /** Where each of those values was found, index-aligned with `values`. */
  readonly locations: readonly SourceLocation[];
}

export type ScanDiagnosticReason =
  | "unreadable"
  | "too-large"
  | "unparseable"
  | "unreadable-directory";

/** One file or directory the scan could not read, reported as data so one bad file never aborts a run. */
export interface ScanDiagnostic {
  /** The file or directory, relative to the run's working directory, with forward slashes. */
  readonly file: string;
  /** Why it was skipped. */
  readonly reason: ScanDiagnosticReason;
}

export interface ProjectScan {
  readonly scannedFiles: number;
  readonly keys: readonly ExtractedKey[];
  readonly dynamic: readonly SourceLocation[];
  readonly conflicts: readonly KeyConflict[];
  readonly diagnostics: readonly ScanDiagnostic[];
}

export interface ScanProjectInput {
  readonly cwd: string;
  readonly roots: readonly string[];
  readonly extractor: SourceExtractor;
  readonly exclude?: readonly string[];
  readonly maxFileBytes?: number;
}

interface KeyRecord {
  readonly first: SourceLocation;
  readonly defaults: Map<string, SourceLocation>;
}

function toPosix(path: string): string {
  return path.split("\\").join("/");
}

interface ScanState {
  readonly keys: Map<string, KeyRecord>;
  readonly dynamic: SourceLocation[];
  readonly diagnostics: ScanDiagnostic[];
  scannedFiles: number;
}

function createScanState(): ScanState {
  return { keys: new Map(), dynamic: [], diagnostics: [], scannedFiles: 0 };
}

function recordCall(
  state: ScanState,
  key: string,
  defaultValue: string | undefined,
  location: SourceLocation,
): void {
  const existing = state.keys.get(key) ?? { first: location, defaults: new Map() };
  if (defaultValue !== undefined && !existing.defaults.has(defaultValue)) {
    existing.defaults.set(defaultValue, location);
  }
  state.keys.set(key, existing);
}

function toExtractedKey(key: string, record: KeyRecord): ExtractedKey | undefined {
  if (record.defaults.size > 1) {
    return undefined;
  }
  const first = [...record.defaults.keys()][0];
  return {
    key,
    value: first ?? "",
    hasDefault: first !== undefined,
    file: record.first.file,
    line: record.first.line,
  };
}

function toConflict(key: string, record: KeyRecord): KeyConflict | undefined {
  if (record.defaults.size < 2) {
    return undefined;
  }
  return {
    key,
    values: [...record.defaults.keys()],
    locations: [...record.defaults.values()],
  };
}

async function scanFile(
  path: string,
  input: ScanProjectInput,
  fs: SourceFs,
  state: ScanState,
): Promise<void> {
  const file = toPosix(relative(input.cwd, path));
  const read = await fs.readTextBounded(path, input.maxFileBytes ?? DEFAULT_MAX_SOURCE_FILE_BYTES);
  if (read.kind !== "ok") {
    state.diagnostics.push({ file, reason: read.kind === "missing" ? "unreadable" : "too-large" });
    return;
  }
  let extraction: ReturnType<SourceExtractor["extract"]>;
  try {
    extraction = input.extractor.extract({ path, content: read.content });
  } catch {
    state.diagnostics.push({ file, reason: "unparseable" });
    return;
  }
  state.scannedFiles += 1;
  for (const call of extraction.calls) {
    recordCall(state, call.key, call.defaultValue, { file, line: call.line });
  }
  for (const site of extraction.dynamic) {
    state.dynamic.push({ file, line: site.line });
  }
}

export async function scanProject(
  input: ScanProjectInput,
  fs: SourceFs = nodeSourceFs,
): Promise<ProjectScan> {
  const state = createScanState();
  const files = await discoverSourceFiles(
    {
      roots: input.roots,
      extensions: input.extractor.extensions,
      ...(input.exclude !== undefined ? { exclude: input.exclude } : {}),
      onUnreadableDirectory: (path) =>
        state.diagnostics.push({
          file: toPosix(relative(input.cwd, path)),
          reason: "unreadable-directory",
        }),
    },
    fs,
  );
  for (const path of files) {
    await scanFile(path, input, fs, state);
  }
  const entries = [...state.keys.entries()];
  return {
    scannedFiles: state.scannedFiles,
    keys: entries
      .map(([key, record]) => toExtractedKey(key, record))
      .filter((entry): entry is ExtractedKey => entry !== undefined),
    dynamic: state.dynamic,
    conflicts: entries
      .map(([key, record]) => toConflict(key, record))
      .filter((conflict): conflict is KeyConflict => conflict !== undefined),
    diagnostics: state.diagnostics,
  };
}
