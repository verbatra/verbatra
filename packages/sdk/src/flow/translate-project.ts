import type { TranslationProvider } from "@verbatra/ai-providers";
import type { AdapterRegistry, FormatAdapter, ReadResult } from "@verbatra/format-adapters";
import { computeFingerprint } from "../cache/fingerprint.js";
import {
  additionsToRecord,
  applyAdditions,
  CACHE_FILE_NAME,
  cacheFilePath,
  readTranslationMemory,
  writeTranslationMemory,
} from "../cache/translation-memory.js";
import type { TranslationMemory } from "../cache/types.js";
import {
  DEFAULT_BUDGET_BEHAVIOR,
  DEFAULT_MAX_BATCH_SIZE,
  type VerbatraConfig,
} from "../config/schema.js";
import { SdkError } from "../errors.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver, type LocalePathResolver } from "../locale-path/resolver.js";
import {
  type LocaleWriteLockOptions,
  type LockWaitListener,
  withLocaleWriteLock,
  writeLockKeyFor,
} from "../lock/locale-write-lock.js";
import {
  baselineFor,
  lockFilePath,
  readLockFile,
  updateLockFileLocale,
} from "../lock/lock-file.js";
import type { LockFile } from "../lock/types.js";
import type { ProgressListener } from "../progress/types.js";
import {
  buildRunStatusFile,
  runStatusFilePath,
  writeRunStatusFile,
} from "../run-status/run-status-file.js";
import { selectAdapter } from "../selection/select-adapter.js";
import { type CreateProvider, selectProvider } from "../selection/select-provider.js";
import type { BudgetTracker } from "./budget.js";
import { createBudgetTracker, toBudgetSummary } from "./budget.js";
import { failureSummary, partition } from "./locale-failure.js";
import { type LocaleRunParams, runLocale } from "./locale-run.js";
import { selectLocales } from "./select-locales.js";
import { readSourceResource } from "./source.js";
import type { LocaleSummary, RunSummary, SdkNotice } from "./summary.js";
import { combineUsage } from "./usage.js";

/** Input for {@link translate}. Only `config` is required; every other field has a default. */
export interface TranslateInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /**
   * Restrict the run to a subset of the configured target locales, which is how you translate one
   * locale at a time against a rate-limited provider. Defaults to every configured target. The
   * result keeps the configured order whatever order the subset is given in, and any locale named
   * here that is not a configured target fails the whole run with `UNKNOWN_LOCALE` before anything
   * is read or spent. An explicit empty array selects no locale at all rather than every locale.
   *
   * Locales left out are untouched: their files, their lock entries, and their translation-memory
   * entries all stay as they were. The run-status file always describes the most recent run alone,
   * so a subset run narrows it to that subset.
   */
  readonly locales?: readonly string[];
  /**
   * Compute the whole run but write nothing and call no provider. The returned
   * {@link RunSummary} reports what would have happened, which makes this safe to run in CI to
   * preview work without spending anything. Defaults to false.
   */
  readonly dryRun?: boolean;
  /**
   * Remove keys that no longer exist in the source. Defaults to the config's `prune`, then to
   * false, so orphaned keys are reported but kept unless removal is asked for explicitly.
   */
  readonly prune?: boolean;
  /**
   * Generate the plural categories a target language requires rather than translating each
   * category separately. Defaults to the config's `generatePlurals`, then to false.
   */
  readonly generatePlurals?: boolean;
  /**
   * Called while waiting on another process's write lock, so a CLI can explain a stall instead of
   * appearing to hang.
   */
  readonly onLockWait?: LockWaitListener;
  /** Called as locales and sub-batches start and finish, for progress reporting. */
  readonly onProgress?: ProgressListener;
  /** How long to wait for a locale's write lock before failing with `LOCK_CONTENDED`. */
  readonly lockAcquireTimeoutMs?: number;
  /**
   * How many locales to run at once. Must be an integer of at least 1; defaults to 1. On a live
   * run it cannot be combined with a configured token budget, because concurrent locales would
   * overshoot the budget nondeterministically.
   */
  readonly concurrency?: number;
  /**
   * Consult and update the translation memory. Defaults to true. Turning it off forces every key
   * through the provider, which is what to do when you want to re-pay for a fresh translation.
   */
  readonly cache?: boolean;
}

/** Injectable dependencies for {@link translate}. Every field has a working default. */
export interface TranslateDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** Provider factory. Defaults to constructing the provider named in the config. */
  readonly createProvider?: CreateProvider;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
}

async function recordRunStatus(
  cwd: string,
  dryRun: boolean,
  summary: RunSummary,
  fs: SdkFs,
): Promise<void> {
  if (dryRun) {
    return;
  }
  try {
    await writeRunStatusFile(runStatusFilePath(cwd), buildRunStatusFile(summary), fs);
  } catch {}
}

interface RunCacheState {
  readonly memory: TranslationMemory;
  readonly fingerprint: string;
  readonly additions: Map<string, Record<string, string>>;
  readonly writable: boolean;
}

async function createRunCacheState(
  input: TranslateInput,
  config: VerbatraConfig,
  cwd: string,
  dryRun: boolean,
  fs: SdkFs,
): Promise<RunCacheState | undefined> {
  if (dryRun || input.cache === false) {
    return undefined;
  }
  const { memory, writable } = await readTranslationMemory(cacheFilePath(cwd), fs);
  return { memory, writable, fingerprint: computeFingerprint(config), additions: new Map() };
}

function withCacheNotices(
  summaries: readonly LocaleSummary[],
  cache: RunCacheState | undefined,
): LocaleSummary[] {
  if (cache === undefined || cache.writable) {
    return [...summaries];
  }
  const notice: SdkNotice = {
    code: "CACHE_VERSION_UNRECOGNIZED",
    message:
      `${CACHE_FILE_NAME} carries a version this build does not recognize, so it was written by a ` +
      "newer verbatra. It was left untouched and this run used no cache. Upgrade verbatra, or " +
      "delete the file to rebuild it in this build's format.",
  };
  return summaries.map((summary) => ({ ...summary, notices: [...summary.notices, notice] }));
}

async function recordCacheAdditions(
  cwd: string,
  cache: RunCacheState | undefined,
  fs: SdkFs,
): Promise<void> {
  if (cache === undefined || cache.additions.size === 0 || !cache.writable) {
    return;
  }
  try {
    const merged = applyAdditions(cache.memory, cache.fingerprint, cache.additions);
    await writeTranslationMemory(cacheFilePath(cwd), merged, fs);
  } catch {}
}

interface LocaleRunContext {
  readonly source: ReadResult;
  readonly adapter: FormatAdapter;
  readonly provider: TranslationProvider | undefined;
  readonly cwd: string;
  readonly config: VerbatraConfig;
  readonly resolver: LocalePathResolver;
  readonly prune: boolean;
  readonly generatePlurals: boolean;
  readonly maxBatchSize: number;
  readonly fs: SdkFs;
  readonly budget: BudgetTracker;
  readonly cache: RunCacheState | undefined;
  readonly onLockWait?: LockWaitListener;
  readonly onProgress?: ProgressListener;
  readonly lockAcquireTimeoutMs?: number;
}

function buildLocaleRunParams(
  context: LocaleRunContext,
  targetLocale: string,
  baseline: ReadonlyMap<string, string>,
): LocaleRunParams {
  return {
    source: context.source.resource,
    sourceInvalidIcuKeys: context.source.invalidIcuKeys,
    baseline,
    adapter: context.adapter,
    provider: context.provider,
    cwd: context.cwd,
    resolver: context.resolver,
    sourceLocale: context.config.sourceLocale,
    targetLocale,
    format: context.config.format,
    glossary: context.config.glossary,
    tone: context.config.tone,
    prune: context.prune,
    generatePlurals: context.generatePlurals,
    maxBatchSize: context.maxBatchSize,
    fs: context.fs,
    budget: context.budget,
    ...(context.cache !== undefined
      ? { cache: { snapshot: context.cache.memory, fingerprint: context.cache.fingerprint } }
      : {}),
    ...(context.onProgress !== undefined ? { onProgress: context.onProgress } : {}),
  };
}

async function runDryLocale(
  context: LocaleRunContext,
  targetLocale: string,
  lock: LockFile,
): Promise<LocaleSummary> {
  const params = buildLocaleRunParams(context, targetLocale, baselineFor(lock, targetLocale));
  return (await runLocale(params)).summary;
}

async function runLiveLocale(
  context: LocaleRunContext,
  targetLocale: string,
): Promise<LocaleSummary> {
  const lockOptions: LocaleWriteLockOptions = {
    ...(context.onLockWait !== undefined ? { onWait: context.onLockWait } : {}),
    ...(context.lockAcquireTimeoutMs !== undefined
      ? { acquireTimeoutMs: context.lockAcquireTimeoutMs }
      : {}),
  };
  return withLocaleWriteLock(
    context.cwd,
    writeLockKeyFor(context.config.format, targetLocale),
    context.fs,
    async () => {
      const lock = await readLockFile(lockFilePath(context.cwd), context.fs);
      const params = buildLocaleRunParams(context, targetLocale, baselineFor(lock, targetLocale));
      const result = await runLocale(params);
      await updateLockFileLocale(context.cwd, context.fs, targetLocale, {
        mode: "replace",
        entries: result.lockEntries,
      });
      if (context.cache !== undefined && result.cacheAdditions.length > 0) {
        context.cache.additions.set(targetLocale, additionsToRecord(result.cacheAdditions));
      }
      return result.summary;
    },
    lockOptions,
  );
}

async function runOneLocale(
  targetLocale: string,
  run: () => Promise<LocaleSummary>,
): Promise<LocaleSummary> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof SdkError && error.code === "LOCK_FILE_INVALID") {
      throw error;
    }
    return failureSummary(targetLocale, error);
  }
}

async function runLocaleAt(
  context: LocaleRunContext,
  targetLocales: readonly string[],
  localeIndex: number,
  runOne: (targetLocale: string) => Promise<LocaleSummary>,
  results: (LocaleSummary | undefined)[],
): Promise<void> {
  const targetLocale = targetLocales[localeIndex];
  if (targetLocale === undefined) {
    return;
  }
  context.onProgress?.({
    type: "locale-started",
    locale: targetLocale,
    localeIndex,
    totalLocales: targetLocales.length,
  });
  const summary = await runOneLocale(targetLocale, () => runOne(targetLocale));
  results[localeIndex] = summary;
  context.onProgress?.({
    type: "locale-finished",
    locale: targetLocale,
    translated: summary.translated.length,
    localeIndex,
    totalLocales: targetLocales.length,
  });
}

async function runLocalesWithProgress(
  context: LocaleRunContext,
  targetLocales: readonly string[],
  runOne: (targetLocale: string) => Promise<LocaleSummary>,
  concurrency: number,
): Promise<LocaleSummary[]> {
  const totalLocales = targetLocales.length;
  const results: (LocaleSummary | undefined)[] = new Array<LocaleSummary | undefined>(totalLocales);
  let nextIndex = 0;
  let abort: { readonly reason: unknown } | undefined;

  async function worker(): Promise<void> {
    while (abort === undefined && nextIndex < totalLocales) {
      const localeIndex = nextIndex;
      nextIndex += 1;
      try {
        await runLocaleAt(context, targetLocales, localeIndex, runOne, results);
      } catch (error) {
        abort ??= { reason: error };
      }
    }
  }

  const workerCount = Math.min(concurrency, totalLocales);
  const workers: Promise<void>[] = [];
  for (let index = 0; index < workerCount; index += 1) {
    workers.push(worker());
  }
  await Promise.all(workers);
  if (abort !== undefined) {
    throw abort.reason;
  }
  return results.filter((summary): summary is LocaleSummary => summary !== undefined);
}

async function runAllLocalesDry(
  context: LocaleRunContext,
  targetLocales: readonly string[],
  concurrency: number,
): Promise<LocaleSummary[]> {
  const lock = await readLockFile(lockFilePath(context.cwd), context.fs);
  return runLocalesWithProgress(
    context,
    targetLocales,
    (targetLocale) => runDryLocale(context, targetLocale, lock),
    concurrency,
  );
}

async function runAllLocalesLive(
  context: LocaleRunContext,
  targetLocales: readonly string[],
  concurrency: number,
): Promise<LocaleSummary[]> {
  return runLocalesWithProgress(
    context,
    targetLocales,
    (targetLocale) => runLiveLocale(context, targetLocale),
    concurrency,
  );
}

function resolveConcurrency(value: number | undefined): number {
  if (value === undefined) {
    return 1;
  }
  if (!Number.isInteger(value) || value < 1) {
    throw new SdkError(
      "CONCURRENCY_INVALID",
      `The concurrency option must be an integer of at least 1, got ${value}.`,
    );
  }
  return value;
}

export function resolveRunConcurrency(
  value: number | undefined,
  dryRun: boolean,
  config: VerbatraConfig,
): number {
  const concurrency = resolveConcurrency(value);
  if (!dryRun && concurrency > 1 && config.maxTokens !== undefined) {
    throw new SdkError(
      "CONCURRENCY_BUDGET_CONFLICT",
      "A token budget (maxTokens) and concurrency greater than 1 cannot be combined on a live run: " +
        "concurrent locales would overshoot the budget nondeterministically. Set concurrency to 1, " +
        "remove maxTokens, or use --dry-run.",
    );
  }
  return concurrency;
}

/**
 * Runs the one-shot translation flow over every configured target locale, or over the subset named
 * by `locales`: read the source, diff
 * each locale against the lock-file baseline, translate what is missing or stale, verify placeholder
 * and ICU integrity, write the locale files, and update the lock-file and translation memory.
 *
 * Failure handling is the contract worth understanding. Whole-run problems, such as an unreadable
 * source file or a provider that cannot be constructed, throw an {@link SdkError} before any locale
 * runs. Once locales are running, a per-locale failure is recorded on that locale's
 * {@link LocaleSummary} and the other locales continue, so one unreachable provider or one
 * unwritable file never discards work that succeeded. A locale whose write lock stays contended is
 * one of these per-locale failures: it is recorded with code `LOCK_CONTENDED` on that locale's
 * summary rather than thrown. Callers should therefore inspect {@link RunSummary.failed} and
 * {@link RunSummary.partial} rather than relying on a thrown error to detect trouble. A partial
 * locale is a locale whose file was written with some keys missing, so treating it as clean would
 * ship an incomplete translation; the CLI exits `1` for it exactly as it does for a failed one.
 *
 * A corrupt lock-file is the one exception. On a live run each locale reads the lock-file inside
 * its own write lock, so `LOCK_FILE_INVALID` escapes as a thrown error even after earlier locales
 * have already translated and written. No further locale is started, and the locales in flight
 * finish and release their write locks before the call rejects.
 *
 * Each locale takes its own write lock for the read-modify-write, so concurrent runs and
 * single-key edits cannot interleave on one file. Translations that fail the integrity gate are
 * refused rather than written, leaving the previous value intact.
 *
 * Set `dryRun` to compute the whole plan without writing or spending anything.
 *
 * @param input - The config and the per-run options.
 * @param deps - Optional adapter registry, provider factory, and file-system overrides.
 * @returns The per-locale account of the run, including usage and budget.
 *
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: `locales` names a locale that is not a configured
 * target. Thrown before anything is read, written, or spent.
 * @throws {@link SdkError} `UNKNOWN_FORMAT`: no adapter is registered for the configured format.
 * @throws {@link SdkError} `CONCURRENCY_INVALID`: `concurrency` is not an integer of at least 1.
 * @throws {@link SdkError} `CONCURRENCY_BUDGET_CONFLICT`: a live run combined a `concurrency` above
 * 1 with a configured token budget. A dry run is exempt.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist.
 * @throws {@link SdkError} `SOURCE_INVALID`: the source locale file could not be parsed.
 * @throws {@link SdkError} `PROVIDER_CONSTRUCTION_FAILED`: the provider could not be constructed,
 * most often because its API key environment variable is unset. Not thrown on a dry run, which
 * never constructs a provider.
 * @throws {@link SdkError} `LOCK_FILE_INVALID`: the lock-file is corrupt, oversized, or at an
 * unsupported version. A dry run reads it once before any locale runs; a live run reads it per
 * locale, so this can abort the run after other locales have already been written.
 *
 * @example
 * ```ts
 * import { loadConfig, translate } from "@verbatra/sdk";
 *
 * const config = await loadConfig();
 * const summary = await translate({
 *   config,
 *   onProgress: (event) => {
 *     if (event.type === "locale-finished") {
 *       console.log(`${event.locale}: ${event.translated} keys`);
 *     }
 *   },
 * });
 *
 * if (summary.failed.length > 0 || summary.partial.length > 0) {
 *   for (const locale of summary.locales.filter((entry) => entry.status !== "succeeded")) {
 *     console.error(`${locale.locale}: ${locale.status} ${locale.error?.message ?? ""}`);
 *   }
 *   process.exitCode = 1;
 * }
 * ```
 */
export async function translate(
  input: TranslateInput,
  deps: TranslateDeps = {},
): Promise<RunSummary> {
  const config = input.config;
  const cwd = input.cwd ?? process.cwd();
  const dryRun = input.dryRun ?? false;
  const targetLocales = selectLocales(config, input.locales);
  const concurrency = resolveRunConcurrency(input.concurrency, dryRun, config);
  const prune = input.prune ?? config.prune ?? false;
  const generatePlurals = input.generatePlurals ?? config.generatePlurals ?? false;
  const maxBatchSize = config.maxBatchSize ?? DEFAULT_MAX_BATCH_SIZE;
  const fs = deps.fs ?? defaultFs;
  const budget = createBudgetTracker(
    config.maxTokens,
    config.budgetBehavior ?? DEFAULT_BUDGET_BEHAVIOR,
  );

  const resolver = createLocalePathResolver(cwd, config);
  const adapter = selectAdapter(config.format, deps.adapterRegistry, deps.fs);
  const provider = dryRun ? undefined : selectProvider(config.provider, deps.createProvider);

  const source = await readSourceResource(config, resolver, fs, adapter);
  const cache = await createRunCacheState(input, config, cwd, dryRun, fs);
  const context: LocaleRunContext = {
    source,
    adapter,
    provider,
    cwd,
    config,
    resolver,
    prune,
    generatePlurals,
    maxBatchSize,
    fs,
    budget,
    cache,
    ...(input.onLockWait !== undefined ? { onLockWait: input.onLockWait } : {}),
    ...(input.onProgress !== undefined ? { onProgress: input.onProgress } : {}),
    ...(input.lockAcquireTimeoutMs !== undefined
      ? { lockAcquireTimeoutMs: input.lockAcquireTimeoutMs }
      : {}),
  };

  const summaries = dryRun
    ? await runAllLocalesDry(context, targetLocales, concurrency)
    : await runAllLocalesLive(context, targetLocales, concurrency);
  input.onProgress?.({ type: "run-finished", localesCompleted: summaries.length });

  const locales = withCacheNotices(summaries, cache);
  const { succeeded, partial, failed } = partition(locales);
  const usage = summaries.reduce<ReturnType<typeof combineUsage>>(
    (total, summary) => combineUsage(total, summary.usage),
    undefined,
  );
  const budgetSummary = toBudgetSummary(budget);
  const summary: RunSummary = {
    dryRun,
    locales,
    succeeded,
    partial,
    failed,
    ...(usage !== undefined ? { usage } : {}),
    ...(budgetSummary !== undefined ? { budget: budgetSummary } : {}),
  };

  await recordCacheAdditions(cwd, cache, fs);
  await recordRunStatus(cwd, dryRun, summary, fs);

  return summary;
}
