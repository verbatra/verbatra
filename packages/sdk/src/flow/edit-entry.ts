import { contentHash } from "@verbatra/core";
import type { AdapterRegistry } from "@verbatra/format-adapters";
import { computeFingerprint } from "../cache/fingerprint.js";
import { feedTranslationMemory } from "../cache/translation-memory.js";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import { withLocaleWriteLock, writeLockKeyFor } from "../lock/locale-write-lock.js";
import { updateLockFileLocale } from "../lock/lock-file.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { readTarget } from "./diff-locales.js";
import { gateCandidateValue, type IntegrityGateReason } from "./integrity-gate.js";
import { selectLocales } from "./select-locales.js";
import { readSource } from "./source.js";
import { writeTargetResource } from "./write-target.js";

/** Input for {@link editEntry}. */
export interface EditEntryInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /** The target locale to write to. Must be a configured target locale. */
  readonly locale: string;
  /** The key to edit. Must exist in the source resource. */
  readonly key: string;
  /** The new translation. It is accepted only if it passes the integrity gate. */
  readonly value: string;
}

/** Injectable dependencies for {@link editEntry}. Every field has a working default. */
export interface EditEntryDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/**
 * The outcome of {@link editEntry}. A rejection is data rather than an exception, because a value
 * that fails the integrity gate is an expected editing outcome that a UI needs to explain, not a
 * failure of the call.
 */
export type EditEntryResult =
  | {
      /** The value passed the integrity gate and was written. */
      readonly accepted: true;
      /** The value now stored for the key. */
      readonly value: string;
    }
  | {
      /** The value was refused; nothing was written and the previous translation is intact. */
      readonly accepted: false;
      /** Which integrity rule the value broke. */
      readonly reason: IntegrityGateReason;
      /** The rejected value, echoed back so a UI can show what was refused. */
      readonly value: string;
    };

/**
 * Saves a manually edited translation for a single key. This is the write path behind a review UI:
 * a human corrects one string and it is persisted without re-running the whole project.
 *
 * The edit is held to the same integrity gate as a provider translation, so a value that drops a
 * placeholder, breaks ICU syntax, runs away into a hugely oversized or repetition-dominated value,
 * or blanks a non-empty string is refused. A refusal comes back as `accepted: false` rather than as
 * a thrown error, and nothing is written.
 *
 * The locale's write lock is taken for the whole read-modify-write, so an edit cannot interleave
 * with a concurrent {@link translate} run on the same locale. The gate runs inside that lock, so a
 * refused edit takes and releases the lock as well and can therefore fail with `LOCK_CONTENDED`
 * even though it would have written nothing. An accepted edit then updates the lock-file baseline
 * and feeds the translation memory, which means a later run treats the key as up to date and
 * reuses the edited text rather than paying the provider to translate it again.
 *
 * Note that the target locale file surfaces the adapter's own error and code rather than a wrapped
 * {@link SdkError}, on the write as well as on the read, because only the source read is wrapped.
 * A malformed target file fails the read with a message naming the offending locale and the
 * resolved path. The write raises the adapter's error too, when the entries cannot be represented
 * in the configured format or the existing destination file cannot be read back to be updated in
 * place, and that error is re-thrown unchanged so its own code survives for a caller that maps
 * adapter codes to its own copy. A caller that maps SDK codes should be ready for an unrecognized
 * error from a target file on either path.
 *
 * @param input - The config, locale, key, and new value.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns Whether the value was accepted, and on rejection the reason.
 *
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: the requested locale is not a configured target locale.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or the locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed.
 * @throws {@link SdkError} `UNKNOWN_KEY`: the key is not present in the source resource.
 * @throws {@link SdkError} `LOCK_CONTENDED`: the locale's write lock could not be acquired before
 * the timeout elapsed.
 * @throws {@link SdkError} `TARGET_UNWRITABLE`: the target locale file could not be written because
 * of a file-system failure. The message names the target file and the file-system code, never the
 * internal temporary file.
 * @throws {@link SdkError} `LOCK_FILE_INVALID`: the lock-file is corrupt, oversized, or at an
 * unsupported version.
 * @throws `AdapterError`: the adapter itself refused the target locale file, on the read because it
 * is malformed or on the write because the entries cannot be represented in the configured format.
 * Its own code is preserved rather than remapped onto an {@link SdkErrorCode}.
 */
export async function editEntry(
  input: EditEntryInput,
  deps: EditEntryDeps = {},
): Promise<EditEntryResult> {
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

  return withLocaleWriteLock(cwd, writeLockKeyFor(config.format, locale), fs, async () => {
    const target = await readTarget(cwd, config, adapter, fs, locale);

    const gate = gateCandidateValue(sourceEntry, input.value, adapter);
    if (!gate.accepted) {
      return { accepted: false, reason: gate.reason, value: input.value };
    }

    const merged = new Map(target.entries);
    merged.set(input.key, { ...sourceEntry, value: input.value, namespace: target.namespace });
    const path = createLocalePathResolver(cwd, config).pathFor(locale);
    await writeTargetResource(
      adapter,
      { locale, namespace: target.namespace, format: config.format, entries: merged },
      path,
      cwd,
    );

    await updateLockFileLocale(cwd, fs, locale, {
      mode: "merge",
      entries: { [input.key]: contentHash(sourceEntry) },
    });

    await feedTranslationMemory(
      cwd,
      fs,
      computeFingerprint(config),
      new Map([[locale, { [contentHash(sourceEntry)]: input.value }]]),
    );

    return { accepted: true, value: input.value };
  });
}
