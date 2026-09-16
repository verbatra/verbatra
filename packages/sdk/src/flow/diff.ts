import type { DiffResult } from "@verbatra/core";
import type { SourceExtractor, SourceFramework } from "@verbatra/extract";
import type { AdapterRegistry } from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import type { SdkFs } from "../fs.js";
import { diffLocales } from "./diff-locales.js";
import { findUnusedKeys, type UnusedKeysReport } from "./unused-keys.js";

/** One locale's pending work in a {@link DiffSummary}, as key names rather than counts. */
export interface LocaleDiff {
  /** The target locale this entry describes. */
  readonly locale: string;
  /** Keys present in the source but absent from this locale. */
  readonly missing: readonly string[];
  /** Keys whose source text changed since this locale was last translated. */
  readonly changed: readonly string[];
  /**
   * Keys present in this locale but no longer in the source. They are reported, never removed,
   * unless a run is asked to prune.
   */
  readonly orphaned: readonly string[];
  /**
   * True when this locale has missing or changed keys. Orphaned keys alone do not count as pending,
   * because they need no translation work.
   */
  readonly hasPendingChanges: boolean;
}

/** The result of {@link diff}: per-locale key lists plus one project-wide verdict. */
export interface DiffSummary {
  /** True when any locale has missing or changed keys. */
  readonly hasPendingChanges: boolean;
  /** Per-locale key lists, in configured target order. */
  readonly locales: readonly LocaleDiff[];
  /**
   * Source-catalog keys nothing in the scanned application source references. Present only when
   * {@link DiffInput.unused} was set. It is a separate axis from each locale's `orphaned` list and
   * never flips {@link DiffSummary.hasPendingChanges}.
   */
  readonly unused?: UnusedKeysReport;
}

/** Input for {@link diff}. */
export interface DiffInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /** Restrict the report to these target locales. Defaults to every configured target locale. */
  readonly locales?: readonly string[];
  /**
   * Also scan the application source configured in the `extract` block and report the
   * source-catalog keys nothing references, as {@link DiffSummary.unused}. Off by default.
   */
  readonly unused?: boolean;
}

/** Injectable dependencies for {@link diff}. Every field has a working default. */
export interface DiffDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /**
   * File-system port. Defaults to the real file system. The unused-key scan needs its
   * `readDirectory` member and reports its absence as `EXTRACT_FS_UNSUPPORTED`.
   */
  readonly fs?: SdkFs;
  /** Extractor factory for the unused-key scan. Defaults to the built-in table keyed by the configured framework. */
  readonly createExtractor?: (framework: SourceFramework) => SourceExtractor;
}

function toLocaleDiff(locale: string, diff: DiffResult): LocaleDiff {
  return {
    locale,
    missing: diff.missing,
    changed: diff.changed,
    orphaned: diff.orphaned,
    hasPendingChanges: diff.missing.length > 0 || diff.changed.length > 0,
  };
}

/**
 * Reports the per-locale drift between the source and each target locale as key names, without
 * writing anything and without calling the provider. It answers "what exactly would a run change",
 * where {@link check} answers "is anything pending at all".
 *
 * The comparison runs against the lock-file baseline, so `changed` means the source text moved
 * since the key was last translated rather than merely that the two strings differ. Orphaned keys
 * are reported but never removed here; pruning happens only in {@link translate}.
 *
 * With `unused` set, it also scans the application source named by the config's `extract` block
 * and reports, in {@link DiffSummary.unused}, every source-catalog key that no call site names. The
 * scan is read-only like the rest of `diff`: it never removes, rewrites, or reorders a catalog, and
 * it constructs no provider and reads no API key. A key that is a plural or context variant of a
 * referenced key (`items_one`, `friend_male`), or that sits under a referenced parent key, counts as
 * referenced. Keys matched by `extract.ignoreUnused` are listed as `ignored`, not as `unused`. When
 * the scan met a dynamic key, an indirect key site, or a file it could not read, the report is
 * `unreliable` and says why; when there is nothing to scan (no `extract` block, a file system with
 * no `readDirectory`, or no source file under the roots) it is `not-run` and lists no key at all.
 *
 * Note that a malformed target locale file surfaces the adapter's own error and code rather than a
 * wrapped {@link SdkError}, because only source reads are wrapped. Its message names the offending
 * locale and the resolved path. A caller that maps SDK codes should be ready for an unrecognized
 * error from a target file.
 *
 * @param input - The config, the optional locale filter, and whether to report unused keys.
 * @param deps - Optional adapter registry, file-system, and extractor-factory overrides.
 * @returns Per-locale missing, changed, and orphaned key lists, plus the unused-key report when
 *   asked for.
 *
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed.
 * @throws {@link SdkError} `LOCK_FILE_INVALID`: the lock-file is corrupt, oversized, or at an
 * unsupported version.
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: a requested locale is not a configured target locale.
 */
export async function diff(input: DiffInput, deps: DiffDeps = {}): Promise<DiffSummary> {
  const results = await diffLocales(input, deps);
  const locales = results.map(({ locale, diff: result }) => toLocaleDiff(locale, result));
  const summary = { hasPendingChanges: locales.some((entry) => entry.hasPendingChanges), locales };
  if (input.unused !== true) {
    return summary;
  }
  const unused = await findUnusedKeys(
    { config: input.config, cwd: input.cwd ?? process.cwd() },
    deps,
  );
  return { ...summary, unused };
}
