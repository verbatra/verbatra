import { resolve } from "node:path";
import type { LocaleResource, TranslationEntry } from "@verbatra/core";
import {
  type ExtractedKey,
  type KeyConflict,
  type ProjectScan,
  type ScanDiagnostic,
  type SourceExtractor,
  type SourceFramework,
  type SourceFs,
  type SourceLocation,
  scanProject,
  toReportedPath,
} from "@verbatra/extract";
import type { AdapterRegistry, FormatAdapter } from "@verbatra/format-adapters";
import { buildExtractor, type ExtractionConfig } from "../config/extraction-config.js";
import type { VerbatraConfig } from "../config/schema.js";
import { errorMessage, SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { selectAdapter } from "../selection/select-adapter.js";

/** One key the run added to the source catalog, and the call site it was found at. */
export interface AddedKey {
  /** The key as written at the call site. */
  readonly key: string;
  /** The value written into the catalog: the call site's default, or the empty string when it had none. */
  readonly value: string;
  /** The source file the key was found in, relative to the run's working directory. */
  readonly file: string;
  /** The one-based line the key was found on. */
  readonly line: number;
}

/**
 * The result of {@link extract}. Everything it reports is a key, a value, or a file and line: a
 * source file's contents never travel in it.
 */
export interface ExtractResult {
  /** The source locale file the run targeted, relative to the run's working directory. */
  readonly sourcePath: string;
  /** How many source files were read and scanned. */
  readonly scannedFiles: number;
  /** Keys that were not in the catalog and were added, in the order they were found. */
  readonly added: readonly AddedKey[];
  /** How many of the keys found were already in the catalog and were left untouched. */
  readonly existingKeys: number;
  /** Added keys whose call site carried no default, so they were written with an empty value. */
  readonly withoutDefault: readonly string[];
  /** Call sites whose key argument was not a static string, reported rather than guessed at. */
  readonly dynamic: readonly SourceLocation[];
  /** Keys found twice with two different default values. Neither value is written. */
  readonly conflicts: readonly KeyConflict[];
  /** Files and directories the scan could not read, which never abort the run. */
  readonly diagnostics: readonly ScanDiagnostic[];
  /** Whether the source catalog was actually written. False for a dry run and for a run that added nothing. */
  readonly written: boolean;
  /** Whether this was a dry run. */
  readonly dryRun: boolean;
}

/** Input for {@link extract}. */
export interface ExtractInput {
  /** A resolved config whose `extract` block names the framework and the source roots. */
  readonly config: VerbatraConfig;
  /** Directory the roots and locale paths are resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /** Report what would be added without writing anything. */
  readonly dryRun?: boolean;
}

/** Injectable dependencies for {@link extract}. Every field has a working default. */
export interface ExtractDeps {
  /** Format-adapter registry to resolve the configured format against. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /**
   * File-system port. It backs both the source scan and the catalog write, so its `readDirectory`
   * member must be implemented. Defaults to the real file system.
   */
  readonly fs?: SdkFs;
  /** Extractor factory. Defaults to the built-in table keyed by the configured framework. */
  readonly createExtractor?: (framework: SourceFramework) => SourceExtractor;
}

function requireExtractionConfig(config: VerbatraConfig): ExtractionConfig {
  if (config.extract === undefined) {
    throw new SdkError(
      "EXTRACT_NOT_CONFIGURED",
      "No extract block is configured. Add an extract block naming a framework and at least one source root to the verbatra config.",
    );
  }
  return config.extract;
}

export function toSourceFs(fs: SdkFs): SourceFs {
  const readDirectory = fs.readDirectory;
  if (readDirectory === undefined) {
    throw new SdkError(
      "EXTRACT_FS_UNSUPPORTED",
      "The supplied file system implements no readDirectory, so no source file can be discovered.",
    );
  }
  return {
    listDirectory: (path) => readDirectory(path),
    readTextBounded: async (path, maxBytes) => fs.readFileBounded(path, maxBytes),
  };
}

async function readExistingResource(
  sourcePath: string,
  config: VerbatraConfig,
  fs: SdkFs,
  adapter: FormatAdapter,
): Promise<LocaleResource> {
  if (!(await fs.fileExists(sourcePath))) {
    return {
      locale: config.sourceLocale,
      namespace: "",
      format: config.format,
      entries: new Map(),
    };
  }
  try {
    return (await adapter.read(sourcePath, config.sourceLocale)).resource;
  } catch (error) {
    throw new SdkError(
      "SOURCE_INVALID",
      `The source locale file at ${sourcePath} could not be read: ${errorMessage(error)}`,
    );
  }
}

function toEntry(
  key: ExtractedKey,
  resource: LocaleResource,
  adapter: FormatAdapter,
): TranslationEntry {
  return {
    key: key.key,
    namespace: resource.namespace,
    value: key.value,
    placeholders: adapter.extractPlaceholders(key.value),
    isPlural: false,
  };
}

function mergedResource(
  resource: LocaleResource,
  added: readonly ExtractedKey[],
  adapter: FormatAdapter,
): LocaleResource {
  const entries = new Map(resource.entries);
  for (const key of added) {
    entries.set(key.key, toEntry(key, resource, adapter));
  }
  return { ...resource, entries };
}

async function writeResource(
  resource: LocaleResource,
  sourcePath: string,
  adapter: FormatAdapter,
): Promise<void> {
  try {
    await adapter.write(resource, sourcePath);
  } catch (error) {
    throw new SdkError(
      "SOURCE_UNWRITABLE",
      `The source locale file at ${sourcePath} could not be written: ${errorMessage(error)}`,
    );
  }
}

function toAddedKey(key: ExtractedKey): AddedKey {
  return { key: key.key, value: key.value, file: key.file, line: key.line };
}

async function runScan(
  extraction: ExtractionConfig,
  cwd: string,
  fs: SdkFs,
  deps: ExtractDeps,
): Promise<ProjectScan> {
  const create = deps.createExtractor ?? buildExtractor;
  return scanProject(
    {
      cwd,
      roots: extraction.roots.map((root) => resolve(cwd, root)),
      extractor: create(extraction.framework),
      ...(extraction.exclude !== undefined ? { exclude: extraction.exclude } : {}),
    },
    toSourceFs(fs),
  );
}

/**
 * Scans a project's own source for translation call sites and merges what it finds into the source
 * locale catalog. It is the one entry point that reads application code rather than a locale file,
 * which is what makes verbatra usable on a project that has no catalog yet.
 *
 * It spends nothing: no provider is constructed, no API key environment variable is read, and no
 * network request is made. A run with no key set succeeds.
 *
 * Only the source locale file is ever written, and only keys that are genuinely new are added: a
 * key already in the catalog keeps its value exactly as it stands, so an editorial fix is never
 * reverted by a stale default left at a call site. A key in the catalog that no call site mentions
 * is left alone. A run that finds nothing new writes nothing at all, so it leaves the file
 * byte-identical and its modification time untouched.
 *
 * Everything the scan cannot resolve is reported as data rather than thrown. A call site whose key
 * argument is not a static string is reported in `dynamic` and never written with a guessed key; a
 * key found twice with two different defaults is reported in `conflicts` and neither value is
 * written; a file or directory that cannot be read is reported in `diagnostics` and the scan
 * carries on. The result never carries a source file's contents, only keys, values, and locations.
 *
 * @param input - The config (whose `extract` block names the framework and roots), the working
 *   directory, and whether this is a dry run.
 * @param deps - Optional adapter registry, file-system, and extractor-factory overrides.
 * @returns What was added, what was already there, and everything the scan could not resolve.
 *
 * @throws {@link SdkError} `EXTRACT_NOT_CONFIGURED`: the config carries no `extract` block.
 * @throws {@link SdkError} `EXTRACT_FS_UNSUPPORTED`: the supplied `deps.fs` implements no
 * `readDirectory`, so no source file can be discovered.
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `SOURCE_INVALID`: a source catalog exists but could not be parsed.
 * @throws {@link SdkError} `SOURCE_UNWRITABLE`: the source catalog could not be written. The
 * `xliff` and `apple-xcstrings` formats reach this when no catalog exists yet: neither is created
 * from nothing, here or anywhere else in verbatra.
 *
 * @example
 * ```ts
 * import { extract, loadConfig } from "@verbatra/sdk";
 *
 * const config = await loadConfig();
 * const result = await extract({ config, dryRun: true });
 * console.log(`${result.added.length} new keys, ${result.dynamic.length} dynamic call sites`);
 * ```
 */
export async function extract(input: ExtractInput, deps: ExtractDeps = {}): Promise<ExtractResult> {
  const extraction = requireExtractionConfig(input.config);
  const cwd = input.cwd ?? process.cwd();
  const fs = deps.fs ?? defaultFs;
  const adapter = selectAdapter(input.config.format, deps.adapterRegistry, fs);
  const resolver = createLocalePathResolver(cwd, input.config);
  const sourcePath = resolver.pathFor(input.config.sourceLocale);
  const scan = await runScan(extraction, cwd, fs, deps);
  const resource = await readExistingResource(sourcePath, input.config, fs, adapter);
  const added = scan.keys.filter((key) => !resource.entries.has(key.key));
  const dryRun = input.dryRun === true;
  const written = added.length > 0 && !dryRun;
  if (written) {
    await writeResource(mergedResource(resource, added, adapter), sourcePath, adapter);
  }
  return {
    sourcePath: toReportedPath(cwd, sourcePath),
    scannedFiles: scan.scannedFiles,
    added: added.map(toAddedKey),
    existingKeys: scan.keys.length - added.length,
    withoutDefault: added.filter((key) => !key.hasDefault).map((key) => key.key),
    dynamic: scan.dynamic,
    conflicts: scan.conflicts,
    diagnostics: scan.diagnostics,
    written,
    dryRun,
  };
}
