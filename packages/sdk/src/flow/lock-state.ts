import { type DiffResult, diffResources } from "@verbatra/core";
import type { AdapterRegistry } from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs, type SdkFs } from "../fs.js";
import {
  type ProvenanceSummary,
  readLocaleProvenance,
  summarizeProvenance,
} from "../lock/key-provenance.js";
import { baselineFor, lockFilePath, readLockFile } from "../lock/lock-file.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { readTarget } from "./diff-locales.js";
import { selectLocales } from "./select-locales.js";
import { readSource } from "./source.js";

/** One locale's lock-file baseline and the drift measured against it. */
export interface LockLocaleState {
  /** The target locale this entry describes. */
  readonly locale: string;
  /** How many keys the lock-file records a baseline hash for in this locale. */
  readonly keyCount: number;
  /** Number of source keys with no translation in this locale yet. */
  readonly missing: number;
  /** Number of keys whose source text changed since the recorded baseline. */
  readonly stale: number;
  /** Number of keys whose translation still matches the recorded baseline. */
  readonly upToDate: number;
  /**
   * Counts by origin and review state over the keys this locale has a value for, read from the
   * provenance file. See {@link KeyProvenance} for what each origin means.
   */
  readonly provenance?: ProvenanceSummary;
}

/**
 * The result of {@link lockState}. The absence of a lock-file is a first-class state rather than an
 * error, because a project that has never been translated legitimately has none.
 */
export type LockStateResult =
  | {
      /** No lock-file exists yet, so there is no baseline to report against. */
      readonly exists: false;
    }
  | {
      /** A lock-file exists and was read successfully. */
      readonly exists: true;
      /** The lock-file's schema version. */
      readonly version: number;
      /** Per-locale baseline sizes and drift, in configured target order. */
      readonly locales: readonly LockLocaleState[];
    };

/** Input for {@link lockState}. */
export interface LockStateInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /** Restrict the report to these target locales. Defaults to every configured target locale. */
  readonly locales?: readonly string[];
}

/** Injectable dependencies for {@link lockState}. Every field has a working default. */
export interface LockStateDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

function toLockLocaleState(locale: string, keyCount: number, diff: DiffResult): LockLocaleState {
  return {
    locale,
    keyCount,
    missing: diff.missing.length,
    stale: diff.changed.length,
    upToDate: diff.unchanged.length,
  };
}

/**
 * Reports the lock-file's existence, version, and the per-locale drift measured against its
 * baseline. It writes nothing and calls no provider.
 *
 * Where {@link check} answers "is the project in sync", this answers "what does the lock-file
 * actually record", which is what a diagnostic view needs when the two disagree: a locale with
 * translations present but a `keyCount` of zero, for instance, means the files were written outside
 * verbatra and have no baseline.
 *
 * When no lock-file exists the call returns `exists: false` rather than throwing, and does no
 * further reading.
 *
 * Note that a malformed target locale file surfaces the adapter's own error and code rather than a
 * wrapped {@link SdkError}, because only source reads are wrapped. Its message names the offending
 * locale and the resolved path. A caller that maps SDK codes should be ready for an unrecognized
 * error from a target file.
 *
 * @param input - The config and the optional locale filter.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns The lock-file's version and per-locale baseline state, or `exists: false`.
 *
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: a requested locale is not a configured target locale.
 * @throws {@link SdkError} `LOCK_FILE_INVALID`: the lock-file is corrupt, oversized, or at an
 * unsupported version.
 * @throws {@link SdkError} `PROVENANCE_FILE_INVALID`: the provenance file is corrupt, oversized, or
 * structurally wrong.
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed.
 */
export async function lockState(
  input: LockStateInput,
  deps: LockStateDeps = {},
): Promise<LockStateResult> {
  const config = input.config;
  const cwd = input.cwd ?? process.cwd();
  const fs = deps.fs ?? defaultFs;
  const locales = selectLocales(config, input.locales);

  const path = lockFilePath(cwd);
  const exists = await fs.fileExists(path);
  if (!exists) {
    return { exists: false };
  }

  const lock = await readLockFile(path, fs);
  const provenanceFor = await readLocaleProvenance(cwd, fs);
  const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);
  const source = await readSource(config, cwd, fs, adapter);

  const localeStates = await Promise.all(
    locales.map(async (locale) => {
      const target = await readTarget(cwd, config, adapter, fs, locale);
      const baseline = baselineFor(lock, locale);
      const diff = diffResources(source.resource, target, { baseline });
      return {
        ...toLockLocaleState(locale, baseline.size, diff),
        provenance: summarizeProvenance(provenanceFor(locale), source.resource, target),
      };
    }),
  );

  return { exists: true, version: lock.version, locales: localeStates };
}
