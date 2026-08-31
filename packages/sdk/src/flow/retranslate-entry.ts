import { ProviderError, type ReviewReasonCode } from "@verbatra/ai-providers";
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
import { type CreateProvider, selectProvider } from "../selection/select-provider.js";
import { readTarget } from "./diff-locales.js";
import { gateCandidateValue, type IntegrityGateReason } from "./integrity-gate.js";
import { selectLocales } from "./select-locales.js";
import { readSource } from "./source.js";
import { buildTranslateRequest } from "./translate-request.js";
import { writeTargetResource } from "./write-target.js";

/** Input for {@link retranslateEntry}. */
export interface RetranslateEntryInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /** The target locale to retranslate into. Must be a configured target locale. */
  readonly locale: string;
  /** The key to retranslate. Must exist in the source resource. */
  readonly key: string;
}

/** Injectable dependencies for {@link retranslateEntry}. Every field has a working default. */
export interface RetranslateEntryDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** Provider factory. Defaults to constructing the provider named in the config. */
  readonly createProvider?: CreateProvider;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

/**
 * The outcome of {@link retranslateEntry}. As with {@link EditEntryResult}, a value refused by the
 * integrity gate is reported as data rather than thrown, because it is an expected outcome of
 * asking a provider for a fresh translation.
 */
export type RetranslateEntryResult =
  | {
      /** The provider's value passed the integrity gate and was written. */
      readonly accepted: true;
      /** The newly translated value now stored for the key. */
      readonly value: string;
      /**
       * Quality signals the provider layer raised for this value, such as a length-ratio outlier or
       * a value identical to the source. Empty when nothing was flagged. The value is written
       * either way; these are advisory.
       */
      readonly reviewReasons: readonly ReviewReasonCode[];
    }
  | {
      /** The value was refused; nothing was written and the previous translation is intact. */
      readonly accepted: false;
      /** Which integrity rule the provider's value broke. */
      readonly reason: IntegrityGateReason;
      /** The rejected value, echoed back so a UI can show what was refused. */
      readonly value: string;
    };

/**
 * Re-runs the configured provider for a single key and saves the result. This is the paid
 * counterpart to {@link editEntry}: it calls the provider and therefore spends tokens, which is why
 * a UI should gate it behind an explicit user action.
 *
 * The returned value goes through the same integrity gate as a full run, so a translation that
 * loses a placeholder or breaks ICU syntax is refused and nothing is written. Provider quality
 * signals are surfaced on an accepted result as `reviewReasons` rather than blocking the write.
 *
 * The locale's write lock is taken before the provider is called and held across it, covering the
 * whole read-translate-write cycle, so a slow provider keeps the lock for the length of its call
 * and a concurrent {@link translate} run on that locale waits. The lock is held for a refused
 * translation too, since the gate runs inside it. An accepted value then updates the lock-file
 * baseline and feeds the translation memory, so a later {@link translate} run sees the key as up
 * to date.
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
 * @param input - The config, locale, and key to retranslate.
 * @param deps - Optional adapter registry, provider factory, and file-system overrides.
 * @returns Whether the new value was accepted, with review reasons or the rejection reason.
 *
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: the requested locale is not a configured target locale.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or the locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed.
 * @throws {@link SdkError} `UNKNOWN_KEY`: the key is not present in the source resource.
 * @throws {@link SdkError} `PROVIDER_CONSTRUCTION_FAILED`: the provider could not be constructed,
 * most often because its API key environment variable is unset.
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
 * @throws `ProviderError` `INVALID_RESPONSE`: the provider returned no value for the key. Provider
 * transport and rate-limit failures propagate as `ProviderError` too, since a single-key call has
 * no per-locale summary to record them on.
 */
export async function retranslateEntry(
  input: RetranslateEntryInput,
  deps: RetranslateEntryDeps = {},
): Promise<RetranslateEntryResult> {
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

  const provider = selectProvider(config.provider, deps.createProvider);

  return withLocaleWriteLock(cwd, writeLockKeyFor(config.format, locale), fs, async () => {
    const target = await readTarget(cwd, config, adapter, fs, locale);

    const result = await provider.translateBatch(
      buildTranslateRequest(
        {
          sourceLocale: config.sourceLocale,
          targetLocale: locale,
          adapter,
          glossary: config.glossary,
          tone: config.tone,
        },
        [sourceEntry],
      ),
    );
    const value = result.values.get(input.key);
    if (value === undefined) {
      throw new ProviderError(
        "INVALID_RESPONSE",
        `The provider returned no translated value for key "${input.key}".`,
      );
    }

    const gate = gateCandidateValue(sourceEntry, value, adapter);
    if (!gate.accepted) {
      return { accepted: false, reason: gate.reason, value };
    }

    const merged = new Map(target.entries);
    merged.set(input.key, { ...sourceEntry, value, namespace: target.namespace });
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
      new Map([[locale, { [contentHash(sourceEntry)]: value }]]),
    );

    const reviewReasons = result.reviewFlags?.get(input.key)?.reasons ?? [];
    return { accepted: true, value, reviewReasons };
  });
}
