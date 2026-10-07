import { type DiffResult, diffResources } from "@verbatra/core";
import type { AdapterRegistry } from "@verbatra/format-adapters";
import { projectCwd } from "../config/project-root.js";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { type ProvenanceSummary, summarizeProvenance } from "../lock/key-provenance.js";
import { baselineFor, lockFilePath } from "../lock/lock-file.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { readTarget } from "./diff-locales.js";
import { readCarriedOverState } from "./locale-carry-over.js";
import { selectLocales } from "./select-locales.js";
import { readSource } from "./source.js";

/** One locale's lock-file baseline and the drift measured against it. */
export interface LockLocaleState {
  /** The target locale this entry describes. */
  readonly locale: string;
  /** How many keys the lock-file records a baseline hash for in this locale. */
  readonly keyCount: number;
  /** Number of source keys with a non-blank value and no translation in this locale yet. */
  readonly missing: number;
  /**
   * Number of keys with a non-blank source value whose source text changed since the recorded
   * baseline.
   */
  readonly stale: number;
  /**
   * Number of translated keys with a non-blank source value whose source text has not changed since
   * the recorded baseline, including translated keys the lock-file has no baseline for.
   */
  readonly upToDate: number;
  /**
   * Number of source keys whose value is empty or whitespace only. They are counted here and
   * never in `missing`, `stale` or `upToDate`, so the four counts add up to the source's keys. A
   * lock-file baseline such a key already has stays in `keyCount`: nothing is translated for it,
   * so no run rewrites or drops that entry. {@link lockState} always sets it; it is optional only
   * so a value built by hand, such as a test double, can leave it out.
   */
  readonly emptySource?: number;
  /**
   * Counts by origin and review state over the keys this locale has a value for, read from the
   * provenance file. See {@link KeyProvenance} for what each origin means. Absent when that file is
   * corrupt or was written by a newer verbatra, since a report never fails over it.
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
  /** Directory the `files.pattern` is resolved against. Defaults to the project root of the config object {@link loadConfig} returned, else the process working directory; a copied or rebuilt config loses that root, so pass `cwd` from {@link resolveProjectRoot}. */
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
    emptySource: diff.emptySource.length,
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
 * State the lock-file and provenance file still record under an underscore spelling of a configured
 * locale (`pt_BR` for `pt-BR`) is read as that locale's, the same way {@link translate} carries it
 * over, so a respelled locale reports the keys a run would retranslate. Nothing is moved or written.
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
  const cwd = projectCwd(input);
  const fs = deps.fs ?? defaultFs;
  const locales = selectLocales(config, input.locales);

  const path = lockFilePath(cwd);
  const exists = await fs.fileExists(path);
  if (!exists) {
    return { exists: false };
  }

  const { lock, provenanceFor } = await readCarriedOverState(cwd, fs, locales);
  const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);
  const source = await readSource(config, cwd, fs, adapter);

  const localeStates = await Promise.all(
    locales.map(async (locale) => {
      const target = await readTarget(cwd, config, adapter, fs, locale);
      const baseline = baselineFor(lock, locale);
      const diff = diffResources(source.resource, target, { baseline });
      const records = provenanceFor?.(locale);
      return {
        ...toLockLocaleState(locale, baseline.size, diff),
        ...(records !== undefined
          ? { provenance: summarizeProvenance(records, source.resource, target) }
          : {}),
      };
    }),
  );

  return { exists: true, version: lock.version, locales: localeStates };
}
