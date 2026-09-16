import { discoverSourceFiles, TEMPLATE_FILE_EXTENSIONS } from "./discovery.js";
import type { FileExtraction, SourceExtractor, UnresolvedKeySiteReason } from "./extractor.js";
import { toReportedPath } from "./reported-path.js";
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

export interface KeyPrefixLocation extends SourceLocation {
  readonly prefix: string;
}

export interface UnresolvedKeyLocation extends SourceLocation {
  readonly reason: UnresolvedKeySiteReason;
}

export interface ProjectKeyUsage {
  readonly referencedKeys: readonly string[];
  readonly dynamic: readonly SourceLocation[];
  readonly prefixes: readonly KeyPrefixLocation[];
  readonly unresolved: readonly UnresolvedKeyLocation[];
  readonly templateFiles: readonly string[];
}

export interface ProjectScan {
  readonly scannedFiles: number;
  readonly keys: readonly ExtractedKey[];
  readonly dynamic: readonly SourceLocation[];
  readonly usage: ProjectKeyUsage;
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

interface UsageState {
  readonly referencedKeys: Set<string>;
  readonly dynamic: SourceLocation[];
  readonly prefixes: KeyPrefixLocation[];
  readonly unresolved: UnresolvedKeyLocation[];
  readonly templateFiles: Set<string>;
}

interface ScanState {
  readonly keys: Map<string, KeyRecord>;
  readonly dynamic: SourceLocation[];
  readonly usage: UsageState;
  readonly diagnostics: ScanDiagnostic[];
  scannedFiles: number;
}

function createScanState(): ScanState {
  return {
    keys: new Map(),
    dynamic: [],
    usage: {
      referencedKeys: new Set(),
      dynamic: [],
      prefixes: [],
      unresolved: [],
      templateFiles: new Set(),
    },
    diagnostics: [],
    scannedFiles: 0,
  };
}

function recordUsage(state: UsageState, file: string, extraction: FileExtraction): void {
  const usage = extraction.usage ?? {
    references: extraction.calls,
    dynamic: extraction.dynamic,
    prefixes: [],
    unresolved: [],
  };
  for (const site of usage.references) {
    state.referencedKeys.add(site.key);
  }
  state.dynamic.push(...usage.dynamic.map((site) => ({ file, line: site.line })));
  state.prefixes.push(
    ...usage.prefixes.map((site) => ({ prefix: site.prefix, file, line: site.line })),
  );
  state.unresolved.push(
    ...usage.unresolved.map((site) => ({ reason: site.reason, file, line: site.line })),
  );
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
  const file = toReportedPath(input.cwd, path);
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
  if (extraction.truncated === true) {
    state.diagnostics.push({ file, reason: "unparseable" });
  }
  for (const call of extraction.calls) {
    recordCall(state, call.key, call.defaultValue, { file, line: call.line });
  }
  for (const site of extraction.dynamic) {
    state.dynamic.push({ file, line: site.line });
  }
  recordUsage(state.usage, file, extraction);
}

function templateExtensions(extractor: SourceExtractor): readonly string[] {
  return TEMPLATE_FILE_EXTENSIONS.filter((extension) => !extractor.extensions.includes(extension));
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
      templateExtensions: templateExtensions(input.extractor),
      onTemplateFile: (path) => state.usage.templateFiles.add(toReportedPath(input.cwd, path)),
      onUnreadableDirectory: (path) =>
        state.diagnostics.push({
          file: toReportedPath(input.cwd, path),
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
    usage: {
      referencedKeys: [...state.usage.referencedKeys],
      dynamic: state.usage.dynamic,
      prefixes: state.usage.prefixes,
      unresolved: state.usage.unresolved,
      templateFiles: [...state.usage.templateFiles].sort(),
    },
    conflicts: entries
      .map(([key, record]) => toConflict(key, record))
      .filter((conflict): conflict is KeyConflict => conflict !== undefined),
    diagnostics: state.diagnostics,
  };
}
