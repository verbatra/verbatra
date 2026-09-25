import {
  ProviderError,
  type ReviewReasonCode,
  type TranslationProvider,
} from "@verbatra/ai-providers";
import { contentHash, type LocaleResource, type TranslationEntry } from "@verbatra/core";
import type { AdapterRegistry, FormatAdapter } from "@verbatra/format-adapters";
import { fingerprintsFor } from "../cache/fingerprint.js";
import { feedTranslationMemory } from "../cache/translation-memory.js";
import { glossaryForLocale } from "../config/glossary.js";
import { assertMachineTranslationEnabled } from "../config/machine-translation.js";
import { toMaxLengthMap } from "../config/max-length.js";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import {
  assertLockAcquireTimeout,
  type LocaleWriteLockOptions,
  type LockWaitListener,
  recordLockOptions,
  withLocaleWriteLock,
  writeLockKeyFor,
  writeLockOptions,
} from "../lock/locale-write-lock.js";
import { updateLockFileLocale } from "../lock/lock-file.js";
import { machineAttribution } from "../lock/machine-attribution.js";
import { type PendingProvenance, settleProvenance } from "../lock/provenance-file.js";
import { assertProvenanceReadable } from "../lock/provenance-notice.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { type CreateProvider, selectProvider } from "../selection/select-provider.js";
import { readTarget } from "./diff-locales.js";
import { gateCandidateValue, type IntegrityGateReason } from "./integrity-gate.js";
import { carryOverBeforeWrite } from "./locale-carry-over.js";
import {
  assertNotPinned,
  assertNotProtected,
  type ProtectionPolicy,
  protectionFor,
  protectionPolicy,
  readProvenanceView,
} from "./protection.js";
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
  /**
   * Replace the key's value even when a person wrote it: its origin is `human` or `import`, or it
   * changed outside verbatra. Without it such a key is refused with `KEY_PROTECTED`, unless the
   * config sets `humanEdits: "overwrite"`. A key matching `pinnedKeys` is refused whatever this
   * says. Defaults to false.
   */
  readonly includeHuman?: boolean;
  /**
   * Called while waiting on another process's write lock for the locale, so a caller can explain a
   * stall instead of appearing to hang. Never called for a lock this process holds itself.
   */
  readonly onLockWait?: LockWaitListener;
  /**
   * How long, in milliseconds, to wait for the locale's write lock before failing with
   * `LOCK_CONTENDED`. The wait happens before the provider is called, so a timed-out call has spent
   * nothing. Defaults to ten minutes. It does not bound the lock-file guard taken to record the
   * written value, which always allows the ten-minute default.
   */
  readonly lockAcquireTimeoutMs?: number;
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
       * Quality signals the provider layer raised for this value, such as a length-ratio outlier,
       * a value identical to the source, or `MAX_LENGTH_EXCEEDED` for a value over the key's
       * configured `maxLength` budget. Never `FUZZY_CACHE_REUSE`, since this path always calls the
       * provider and never consults the translation memory. Empty when nothing was flagged. The
       * value is written either way; these are advisory.
       */
      readonly reviewReasons: readonly ReviewReasonCode[];
    }
  | {
      /** The value was refused; nothing was written and the previous translation is intact. */
      readonly accepted: false;
      /** Which integrity rule the provider's value broke. */
      readonly reason: IntegrityGateReason;
      /**
       * What is behind a `placeholder`, `markup`, or `icu` refusal. For `placeholder`, each
       * placeholder the source had and the candidate dropped, prefixed with `-`, then each one the
       * candidate invented, prefixed with `+`. For `markup`, the specific tags in the same notation;
       * a candidate carrying more than twice its source's inline tags and constructs is named as
       * `+more than N inline tags` instead, where N is at least 256, and the field is absent when no
       * single tag is at fault, such as markup that came back mis-nested. For `icu`, each branch arm
       * that does not fit the target language, absent when the message itself is invalid. Absent
       * for every other reason.
       */
      readonly details?: readonly string[];
      /** The rejected value, echoed back so a UI can show what was refused. */
      readonly value: string;
    };

function machinePending(
  value: string,
  config: VerbatraConfig,
  provider: TranslationProvider,
): PendingProvenance {
  const attribution = machineAttribution(config.provider, provider.id);
  return attribution === undefined
    ? { origin: "machine", value }
    : { origin: "machine", value, attribution };
}

interface UnderLockContext {
  readonly config: VerbatraConfig;
  readonly cwd: string;
  readonly fs: SdkFs;
  readonly adapter: FormatAdapter;
  readonly locale: string;
  readonly key: string;
  readonly sourceEntry: TranslationEntry;
  readonly policy: ProtectionPolicy;
  readonly provider: TranslationProvider;
  readonly recordLock: LocaleWriteLockOptions;
}

async function translateOne(context: UnderLockContext) {
  const { config, locale, adapter, sourceEntry } = context;
  const result = await context.provider.translateBatch(
    buildTranslateRequest(
      {
        sourceLocale: config.sourceLocale,
        targetLocale: locale,
        adapter,
        glossary: glossaryForLocale(config.glossary, locale),
        maxLength: toMaxLengthMap(config.maxLength),
        tone: config.tone,
      },
      [sourceEntry],
    ),
  );
  const value = result.values.get(context.key);
  if (value === undefined) {
    throw new ProviderError(
      "INVALID_RESPONSE",
      `The provider returned no translated value for key "${context.key}".`,
    );
  }
  return { value, reviewReasons: result.reviewFlags?.get(context.key)?.reasons ?? [] };
}

async function saveAccepted(
  context: UnderLockContext,
  target: LocaleResource,
  value: string,
): Promise<void> {
  const { config, cwd, fs, adapter, locale, key, sourceEntry } = context;
  const merged = new Map(target.entries);
  merged.set(key, { ...sourceEntry, value, namespace: target.namespace });
  const resolver = createLocalePathResolver(cwd, config);
  await writeTargetResource(
    adapter,
    { locale, namespace: target.namespace, format: config.format, entries: merged },
    resolver.pathFor(locale),
    cwd,
    { sourcePath: resolver.pathFor(config.sourceLocale) },
  );
  const hash = contentHash(sourceEntry);
  await updateLockFileLocale(
    cwd,
    fs,
    locale,
    { mode: "merge", entries: { [key]: hash } },
    settleProvenance(
      new Map([[key, machinePending(value, config, context.provider)]]),
      await readTarget(cwd, config, adapter, fs, locale),
    ),
    context.recordLock,
  );
  await feedTranslationMemory(
    cwd,
    fs,
    fingerprintsFor(config),
    new Map([[locale, { [hash]: { contentHash: hash, value, source: sourceEntry.value } }]]),
  );
}

async function retranslateUnderLock(context: UnderLockContext): Promise<RetranslateEntryResult> {
  const { config, cwd, fs, adapter, locale, key, sourceEntry } = context;
  const target = await readTarget(cwd, config, adapter, fs, locale);
  const provenance = await readProvenanceView(context.policy, cwd, fs, locale);
  assertNotProtected(
    protectionFor(context.policy, provenance, key, target.entries.get(key)?.value),
    key,
    locale,
  );
  const { value, reviewReasons } = await translateOne(context);
  const gate = gateCandidateValue(sourceEntry, value, adapter, locale);
  if (!gate.accepted) {
    return {
      accepted: false,
      reason: gate.reason,
      ...(gate.details !== undefined ? { details: gate.details } : {}),
      value,
    };
  }
  await saveAccepted(context, target, value);
  return { accepted: true, value, reviewReasons };
}

/**
 * Re-runs the configured provider for a single key and saves the result. This is the paid
 * counterpart to {@link editEntry}: it calls the provider and therefore spends tokens, which is why
 * a UI should gate it behind an explicit user action.
 *
 * The returned value goes through the same integrity gate as a full run, so a translation that
 * loses a placeholder, breaks the source's inline markup, breaks ICU syntax, degenerates into
 * runaway output, or comes back blank is refused and nothing is written. Provider quality
 * signals are surfaced on an accepted result as `reviewReasons` rather than blocking the write.
 *
 * The locale's write lock is taken before the provider is called and held across it, covering the
 * whole read-translate-write cycle, so a slow provider keeps the lock for the length of its call
 * and a concurrent {@link translate} run on that locale waits. The lock is held for a refused
 * translation too, since the gate runs inside it. An accepted value then updates the lock-file
 * baseline and feeds the translation memory, so a later {@link translate} run sees the key as up
 * to date. The provenance file records the value as `machine`, naming the `id` of the provider that
 * answered and, when that is the configured provider, its model, and any earlier review decision
 * on the key is cleared.
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
 * It spends outside the token budget. `maxTokens` and `budgetBehavior` bound a {@link translate}
 * run, and this is its own single-key path with its own provider, so a configured ceiling neither
 * withholds this call nor counts it. A caller that exposes retranslation to users, as the Studio
 * dashboard and the agent tools do, has to bound that spend itself.
 *
 * @param input - The config, locale, and key to retranslate.
 * @param deps - Optional adapter registry, provider factory, and file-system overrides.
 * @returns Whether the new value was accepted, with review reasons or the rejection reason.
 *
 * @throws {@link SdkError} `MACHINE_TRANSLATION_DISABLED`: the config sets `provider: { id: "none" }`.
 * Thrown first, before anything is read, locked, or constructed.
 * @throws {@link SdkError} `LOCK_TIMEOUT_INVALID`: `lockAcquireTimeoutMs` is not a whole number of
 * milliseconds of at least 0. Thrown before anything is read or locked.
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: the requested locale is not a configured target locale.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or the locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed.
 * @throws {@link SdkError} `UNKNOWN_KEY`: the key is not present in the source resource.
 * @throws {@link SdkError} `KEY_PINNED`: the key matches the config's `pinnedKeys`. Thrown before
 * the provider is constructed.
 * @throws {@link SdkError} `KEY_PROTECTED`: the key's current value was written by a person, imported,
 * or changed outside verbatra (or its origin cannot be read because the provenance file is from a
 * newer verbatra), and neither `includeHuman` nor `humanEdits: "overwrite"` was set. Thrown inside
 * the write lock, before the provider is called.
 * @throws {@link SdkError} `PROVIDER_CONSTRUCTION_FAILED`: the provider could not be constructed,
 * most often because its API key environment variable is unset.
 * @throws {@link SdkError} `NETWORK_POLICY_VIOLATION`: the effective network policy does not permit
 * the configured provider's endpoint or its proxy. Thrown before the provider is constructed or any
 * API key is read.
 * @throws {@link SdkError} `CONFIG_INVALID`: `VERBATRA_NETWORK_POLICY` or
 * `VERBATRA_NETWORK_ALLOWED_HOSTS` holds a value that is not valid.
 * @throws {@link SdkError} `LOCK_CONTENDED`: the locale's write lock could not be acquired before
 * `lockAcquireTimeoutMs` elapsed.
 * @throws {@link SdkError} `TARGET_UNWRITABLE`: the target locale file could not be written because
 * of a file-system failure. The message names the target file and the file-system code, never the
 * internal temporary file.
 * @throws {@link SdkError} `LOCALE_STATE_NOT_CARRIED_OVER`: state recorded under a respelled code
 * of the locale, such as `pt_BR` for `pt-BR`, could not be moved to it first, so nothing was
 * written.
 * @throws {@link SdkError} `LOCK_FILE_INVALID`: the lock-file is corrupt, oversized, or at an
 * unsupported version.
 * @throws {@link SdkError} `PROVENANCE_FILE_INVALID`: the provenance file is corrupt, oversized, or
 * structurally wrong. Checked before the provider is called or anything is written. A file from a
 * newer verbatra is left untouched and the value is written without a record, and so is a value
 * whose record would grow the file past the size verbatra reads back.
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
  assertMachineTranslationEnabled(config, "retranslating a key");
  assertLockAcquireTimeout(input.lockAcquireTimeoutMs);
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

  const policy = protectionPolicy(config, input.includeHuman === true ? "overwrite" : undefined);
  assertNotPinned(policy, input.key);
  const provider = selectProvider(config.provider, deps.createProvider, {
    network: config.network,
  });
  await assertProvenanceReadable(cwd, fs);
  await carryOverBeforeWrite(cwd, fs, locale, writeLockOptions(input));

  return withLocaleWriteLock(
    cwd,
    writeLockKeyFor(config.format, locale),
    fs,
    () =>
      retranslateUnderLock({
        config,
        cwd,
        fs,
        adapter,
        locale,
        key: input.key,
        sourceEntry,
        policy,
        provider,
        recordLock: recordLockOptions(input),
      }),
    writeLockOptions(input),
  );
}
