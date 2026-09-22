import {
  checkPlaceholders,
  diffResources,
  type LocaleResource,
  type TranslationEntry,
} from "@verbatra/core";
import type { AdapterRegistry, FormatAdapter } from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { baselineFor, lockFilePath, readLockFile } from "../lock/lock-file.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { judgeEntryMarkup } from "./markup-verdict.js";
import { readTargetResource } from "./read-target.js";
import { selectLocales } from "./select-locales.js";
import { readSourceResource } from "./source.js";

/** One key's placeholder, ICU, and inline-markup verdict in a {@link LocaleKeyIntegrity} report. */
export interface KeyIntegrityEntry {
  /** The key this verdict describes. */
  readonly key: string;
  /** Whether the source text contains any placeholders at all. When false, `matches` is trivially true. */
  readonly hasPlaceholders: boolean;
  /** True when the translation carries exactly the source's placeholders. */
  readonly matches: boolean;
  /** Placeholders present in the source but absent from the translation. */
  readonly missing: readonly string[];
  /** Placeholders present in the translation but not in the source. */
  readonly extra: readonly string[];
  /** True when the translation parses as a valid ICU message under the configured format. */
  readonly icuValid: boolean;
  /**
   * True when the translation carries the source's inline HTML or XML tags, well formed. Compared
   * exactly as the write-time gate compares them, so a value already on disk is judged by the same
   * rule as one about to be written.
   */
  readonly markupMatches: boolean;
  /**
   * The tags behind a `markupMatches: false` verdict, each prefixed with `-` for one the source has
   * and the translation lacks or `+` for one the translation added, or `+more than N inline tags`
   * for a translation carrying more than twice its source's inline tags and constructs (N is at
   * least 256). Empty when the markup matches, and empty when no single tag is at fault because
   * the translation's markup is structurally broken.
   */
  readonly markupDetails: readonly string[];
}

/** One locale's per-key integrity verdicts. */
export interface LocaleKeyIntegrity {
  /** The target locale these verdicts describe. */
  readonly locale: string;
  /** Verdicts for the changed keys that exist in both the source and this locale. */
  readonly entries: readonly KeyIntegrityEntry[];
}

/** Input for {@link keyIntegrity}. */
export interface KeyIntegrityInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /** Restrict the report to these target locales. Defaults to every configured target locale. */
  readonly locales?: readonly string[];
  /**
   * Restrict the report to these keys. Only keys the diff reports as changed are ever judged, so a
   * requested key that is missing, orphaned, or up to date is left out rather than reported.
   * Defaults to every changed key.
   */
  readonly keys?: readonly string[];
}

/** Injectable dependencies for {@link keyIntegrity}. Every field has a working default. */
export interface KeyIntegrityDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

function checkEntryIntegrity(
  adapter: FormatAdapter,
  sourceEntry: TranslationEntry,
  targetEntry: TranslationEntry,
): KeyIntegrityEntry {
  const result =
    adapter.comparePlaceholders?.(sourceEntry.value, targetEntry.value) ??
    checkPlaceholders(sourceEntry.placeholders, targetEntry.placeholders);
  const markup = judgeEntryMarkup(sourceEntry, targetEntry.value);
  return {
    key: sourceEntry.key,
    hasPlaceholders: sourceEntry.placeholders.length > 0,
    matches: result.matches,
    missing: result.missing,
    extra: result.extra,
    icuValid: adapter.validateMessage(targetEntry.value),
    markupMatches: markup.matches,
    markupDetails: markup.details,
  };
}

function selectChangedKeys(
  changed: readonly string[],
  requested: readonly string[] | undefined,
): readonly string[] {
  if (requested === undefined) {
    return changed;
  }
  const wanted = new Set(requested);
  return changed.filter((key) => wanted.has(key));
}

function integrityEntriesFor(
  source: LocaleResource,
  target: LocaleResource,
  adapter: FormatAdapter,
  changedKeys: readonly string[],
): readonly KeyIntegrityEntry[] {
  const entries: KeyIntegrityEntry[] = [];
  for (const key of changedKeys) {
    const sourceEntry = source.entries.get(key);
    const targetEntry = target.entries.get(key);
    /* v8 ignore next 3 -- diffResources only reports a key as "changed" when it exists in both
       the source and the target resource, so this branch is unreachable by construction. */
    if (sourceEntry === undefined || targetEntry === undefined) {
      continue;
    }
    entries.push(checkEntryIntegrity(adapter, sourceEntry, targetEntry));
  }
  return entries;
}

/**
 * Reports, per changed key, whether the existing translation still carries the source's
 * placeholders and inline markup and still parses as valid ICU. It writes nothing and calls no
 * provider.
 *
 * The scope is deliberately the changed keys rather than every key: a key whose source text has not
 * moved was already gated when it was written, so re-reporting it would bury the keys that a source
 * edit may have just invalidated. Only keys present in both the source and the target are judged,
 * since a missing translation has no placeholders to compare.
 *
 * This is the read-only counterpart to the placeholder, ICU and inline-markup checks of the
 * write-time integrity gate that {@link translate}, {@link editEntry}, {@link retranslateEntry},
 * and the workbook and TMX imports enforce, and the data behind a
 * review dashboard's per-key integrity indicator. Reporting markup here is what makes drift that
 * predates the gate visible at all: a translation written before the check existed, edited outside
 * verbatra, or produced by a path that never crossed the gate is judged here by the same rule.
 * Emptiness and degeneracy are deliberately not reported: both describe a candidate that was
 * refused rather than a state a stored translation can usefully be in.
 *
 * Note that a malformed target locale file surfaces the adapter's own error and code rather than a
 * wrapped {@link SdkError}, because only source reads are wrapped. Its message names the offending
 * locale and the resolved path. A caller that maps SDK codes should be ready for an unrecognized
 * error from a target file.
 *
 * @param input - The config and the optional locale and key filters.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns One entry per requested locale, each holding its per-key verdicts.
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
export async function keyIntegrity(
  input: KeyIntegrityInput,
  deps: KeyIntegrityDeps = {},
): Promise<readonly LocaleKeyIntegrity[]> {
  const config = input.config;
  const cwd = input.cwd ?? process.cwd();
  const fs = deps.fs ?? defaultFs;
  const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);
  const resolver = createLocalePathResolver(cwd, config);

  const source = await readSourceResource(config, resolver, fs, adapter);
  const lock = await readLockFile(lockFilePath(cwd), fs);

  return Promise.all(
    selectLocales(config, input.locales).map(async (locale) => {
      const target = await readTargetResource({
        resolver,
        format: config.format,
        locale,
        adapter,
        fs,
      });
      const diffResult = diffResources(source.resource, target, {
        baseline: baselineFor(lock, locale),
      });
      const changedKeys = selectChangedKeys(diffResult.changed, input.keys);
      const entries = integrityEntriesFor(source.resource, target, adapter, changedKeys);
      return { locale, entries };
    }),
  );
}
