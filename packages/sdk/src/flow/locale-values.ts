import type { LocaleResource } from "@verbatra/core";
import type { AdapterRegistry } from "@verbatra/format-adapters";
import { projectCwd } from "../config/project-root.js";
import type { VerbatraConfig } from "../config/schema.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { type KeyProvenance, keyProvenance } from "../lock/key-provenance.js";
import type { ProvenanceRecord } from "../lock/provenance-file.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { readCarriedOverProvenance } from "./locale-carry-over.js";
import { readTargetResource } from "./read-target.js";
import { selectLocales } from "./select-locales.js";
import { readSourceResource } from "./source.js";

/** One key's current source and target text within a {@link LocaleValues} map. */
export interface KeyValuePair {
  /** The key's text in the source locale, absent when the key exists only in this target (orphaned). */
  readonly source?: string;
  /** The key's text in this target locale, absent when the key has not been translated yet. */
  readonly target?: string;
  /**
   * The provenance of the current translation, read from the provenance file. Absent when
   * `target` is, and when that file is corrupt or was written by a newer verbatra.
   */
  readonly provenance?: KeyProvenance;
}

/** One target locale's current source and target text for every key, as returned by {@link localeValues}. */
export interface LocaleValues {
  /** The target locale these values were read for. */
  readonly locale: string;
  /**
   * Every key in {@link LocaleValues.values}, in source key order, followed by the keys present only
   * in this target locale in that file's order. Use it to iterate in a stable, meaningful order:
   * the object's own key order puts integer-like keys first.
   */
  readonly keys: readonly string[];
  /**
   * Source and target text per key, keyed by key name. Covers missing, changed, orphaned, and
   * in-sync keys alike. The object has no prototype, so every key, including `__proto__` or
   * `constructor`, is an own property and a key absent from the catalog reads as `undefined`.
   */
  readonly values: Readonly<Record<string, KeyValuePair>>;
}

/** Input for {@link localeValues}. */
export interface LocaleValuesInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the project root of the config object {@link loadConfig} returned, else the process working directory; a copied or rebuilt config loses that root, so pass `cwd` from {@link resolveProjectRoot}. */
  readonly cwd?: string;
  /** Restrict the report to these target locales. Defaults to every configured target locale. */
  readonly locales?: readonly string[];
}

/** Injectable dependencies for {@link localeValues}. Every field has a working default. */
export interface LocaleValuesDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

function provenanceOf(
  records: ReadonlyMap<string, ProvenanceRecord> | undefined,
  key: string,
  value: string,
): { provenance?: KeyProvenance } {
  return records === undefined ? {} : { provenance: keyProvenance(records.get(key), value) };
}

function mergeValues(
  source: LocaleResource,
  target: LocaleResource,
  records: ReadonlyMap<string, ProvenanceRecord> | undefined,
): Record<string, KeyValuePair> {
  const keys = new Set([...source.entries.keys(), ...target.entries.keys()]);
  const values: Record<string, KeyValuePair> = Object.create(null);
  for (const key of keys) {
    const sourceEntry = source.entries.get(key);
    const targetEntry = target.entries.get(key);
    values[key] = {
      ...(sourceEntry !== undefined ? { source: sourceEntry.value } : {}),
      ...(targetEntry !== undefined
        ? { target: targetEntry.value, ...provenanceOf(records, key, targetEntry.value) }
        : {}),
    };
  }
  return values;
}

/**
 * Reads every key's current source and target text, across every requested target locale, in one
 * pass over the files already on disk. It writes nothing and calls no provider.
 *
 * This exists to back client-side search over translation content rather than key names alone: a
 * caller holding the result in memory can match a query against source or target text without a
 * further round trip per key. {@link keyValue} and {@link diff} answer narrower questions (one key,
 * or key names only); this is the bulk read a caller would otherwise have to simulate with many
 * {@link keyValue} calls.
 *
 * A key present in the source but not yet translated in a locale reports `target` as absent; a key
 * present in a locale but no longer in the source (orphaned) reports `source` as absent instead. A
 * target locale file that does not exist yet is treated as empty rather than as an error, so every
 * key in a newly added locale reports `target` as absent.
 *
 * Note that a malformed target locale file surfaces the adapter's own error and code rather than a
 * wrapped {@link SdkError}, because only source reads are wrapped. Its message names the offending
 * locale and the resolved path. A caller that maps SDK codes should be ready for an unrecognized
 * error from a target file.
 *
 * @param input - The config and the optional locale filter.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns Per-locale source and target text, keyed by key name.
 *
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed.
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: a requested locale is not a configured target locale.
 * @throws `AdapterError`: the adapter refused a target locale file because it is malformed. Its
 * own code is preserved rather than remapped onto an {@link SdkErrorCode}.
 *
 * @example
 * ```ts
 * import { loadConfig, localeValues } from "@verbatra/sdk";
 *
 * const config = await loadConfig();
 * const locales = await localeValues({ config });
 *
 * const needle = "welcome";
 * for (const locale of locales) {
 *   for (const [key, pair] of Object.entries(locale.values)) {
 *     if (pair.target?.toLowerCase().includes(needle)) {
 *       console.log(`${locale.locale} ${key}: ${pair.target}`);
 *     }
 *   }
 * }
 * ```
 */
export async function localeValues(
  input: LocaleValuesInput,
  deps: LocaleValuesDeps = {},
): Promise<readonly LocaleValues[]> {
  const config = input.config;
  const cwd = projectCwd(input);
  const fs = deps.fs ?? defaultFs;
  const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);
  const resolver = createLocalePathResolver(cwd, config);

  const source = await readSourceResource(config, resolver, fs, adapter);
  const locales = selectLocales(config, input.locales);
  const provenanceFor = await readCarriedOverProvenance(cwd, fs, locales);

  return Promise.all(
    locales.map(async (locale) => {
      const target = await readTargetResource({
        resolver,
        format: config.format,
        locale,
        adapter,
        fs,
      });
      const keys = [...new Set([...source.resource.entries.keys(), ...target.entries.keys()])];
      return {
        locale,
        keys,
        values: mergeValues(source.resource, target, provenanceFor?.(locale)),
      };
    }),
  );
}
