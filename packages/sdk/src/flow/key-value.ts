import type { AdapterRegistry } from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { type KeyProvenance, keyProvenance } from "../lock/key-provenance.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { readTarget } from "./diff-locales.js";
import { readCarriedOverProvenance } from "./locale-carry-over.js";
import { selectLocales } from "./select-locales.js";
import { readSource } from "./source.js";

/** Input for {@link keyValue}. */
export interface KeyValueInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /** The target locale to read the translation from. Must be a configured target locale. */
  readonly locale: string;
  /** The key to read. Must exist in the source resource. */
  readonly key: string;
}

/** Injectable dependencies for {@link keyValue}. Every field has a working default. */
export interface KeyValueDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/** One key's current source and target text, as returned by {@link keyValue}. */
export interface KeyValueResult {
  /** The key's text in the source locale. Always present, since a missing key is an error. */
  readonly source: string;
  /**
   * The context the source locale file gives for the key, for translators: an ARB
   * `@key.description`, an XLIFF note, a gettext comment, an Apple `.strings` comment, or a .NET
   * `.resx` comment. Absent when the format or the file carries none.
   */
  readonly description?: string;
  /** The key's text in the requested target locale, or absent when it has not been translated yet. */
  readonly target?: string;
  /**
   * The provenance of the current translation, read from the provenance file. Absent when
   * `target` is, and when that file is corrupt or was written by a newer verbatra.
   */
  readonly provenance?: KeyProvenance;
}

/**
 * Reads one key's current source and target text. It writes nothing and calls no provider, and is
 * the read half of the single-key editing flow that {@link editEntry} and
 * {@link retranslateEntry} complete.
 *
 * The two sides are asymmetric on purpose: a key absent from the source is an error, because it
 * cannot be edited or retranslated, while a key absent from the target is normal and simply comes
 * back with no `target`.
 *
 * Note that a malformed target locale file surfaces the adapter's own error and code rather than a
 * wrapped {@link SdkError}, because only source reads are wrapped. Its message names the offending
 * locale and the resolved path. A caller that maps SDK codes should be ready for an unrecognized
 * error from a target file.
 *
 * @param input - The config, locale, and key to read.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns The key's source text, its description when the source locale file gives one, and,
 * when present, its current translation with that translation's provenance.
 *
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: the requested locale is not a configured target locale.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or the locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed.
 * @throws {@link SdkError} `UNKNOWN_KEY`: the key is not present in the source resource.
 */
export async function keyValue(
  input: KeyValueInput,
  deps: KeyValueDeps = {},
): Promise<KeyValueResult> {
  const config = input.config;
  const cwd = input.cwd ?? process.cwd();
  const fs = deps.fs ?? defaultFs;
  const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);

  const [locale] = selectLocales(config, [input.locale]);
  /* v8 ignore next 3 -- selectLocales with a one-element requested array either throws UNKNOWN_LOCALE or returns that exact element; `locale` is never undefined here. */
  if (locale === undefined) {
    throw new SdkError("UNKNOWN_LOCALE", `Locale "${input.locale}" could not be resolved.`);
  }

  const source = await readSource(config, cwd, fs, adapter);
  const sourceEntry = source.resource.entries.get(input.key);
  if (sourceEntry === undefined) {
    throw new SdkError(
      "UNKNOWN_KEY",
      `The key "${input.key}" was not found in the source resource.`,
    );
  }

  const context = {
    source: sourceEntry.value,
    ...(sourceEntry.description !== undefined ? { description: sourceEntry.description } : {}),
  };
  const target = await readTarget(cwd, config, adapter, fs, locale);
  const targetEntry = target.entries.get(input.key);
  if (targetEntry === undefined) {
    return context;
  }
  const records = (await readCarriedOverProvenance(cwd, fs, [locale]))?.(locale);
  return {
    ...context,
    target: targetEntry.value,
    ...(records !== undefined
      ? { provenance: keyProvenance(records.get(input.key), targetEntry.value) }
      : {}),
  };
}
