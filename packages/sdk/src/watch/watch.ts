import type { AdapterRegistry } from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import { describeError, SdkError } from "../errors.js";
import { selectLocales } from "../flow/select-locales.js";
import type { RunSummary } from "../flow/summary.js";
import { resolveRunConcurrency, type TranslateInput } from "../flow/translate-project.js";
import { defaultFs, type SdkFs } from "../fs.js";
import { createLocalePathResolver } from "../locale-path/resolver.js";
import type { LockWaitListener } from "../lock/locale-write-lock.js";
import type { ProgressListener } from "../progress/types.js";
import type { CreateProvider } from "../selection/select-provider.js";
import { defaultCreateWatcher, defaultRunTranslate } from "./wiring.js";

const DEFAULT_DEBOUNCE_MS = 300;

/**
 * The minimal file-watching surface {@link watch} needs. Supplying your own through
 * `deps.createWatcher` lets an embedding application reuse a watcher it already runs, or drive the
 * flow deterministically in a test.
 */
export interface Watcher {
  /** Registers a listener called on each change to the watched paths. */
  onChange(listener: () => void): void;
  /** Stops watching and releases the underlying resources. */
  close(): Promise<void>;
}

/** Builds a {@link Watcher} over the given absolute paths. Defaults to a chokidar-backed watcher. */
export type CreateWatcher = (paths: readonly string[]) => Watcher;

/** Runs one translation pass. Defaults to {@link translate}, and is the seam a test substitutes. */
export type RunTranslate = (input: TranslateInput) => Promise<RunSummary>;

/**
 * The outcome of a single watch-triggered run, handed to `onRun`. A failed run is reported here
 * rather than thrown, because a long-lived watcher must survive a bad run and keep watching.
 */
export type WatchRunResult =
  | {
      /** The run completed. Inspect the summary for per-locale outcomes, which may still include failures. */
      readonly status: "succeeded";
      /** The run's per-locale account. */
      readonly summary: RunSummary;
    }
  | {
      /** The run threw before producing a summary, for instance because the source became unreadable. */
      readonly status: "failed";
      /** The failure's code and message. Never carries a secret. */
      readonly error: {
        /** The failure's own code where it had one, and `WATCH_RUN_FAILED` otherwise. */
        readonly code: string;
        /** A human-readable description of the failure. Never contains a secret. */
        readonly message: string;
      };
    };

/** Input for {@link watch}. */
export interface WatchInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /**
   * Directory the `files.pattern` is resolved against, and where each run's lock-file, translation
   * memory, and run-status file live. Defaults to the process working directory.
   */
  readonly cwd?: string;
  /**
   * Restrict every run of the session to a subset of the configured target locales. Validated once
   * when watching starts, so an unconfigured locale throws `UNKNOWN_LOCALE` before any watching
   * begins rather than failing on each run. An explicit empty array selects no locale at all.
   */
  readonly locales?: readonly string[];
  /** How long to coalesce rapid source changes before running. Defaults to 300 milliseconds. */
  readonly debounceMs?: number;
  /**
   * Called after every run with its outcome. This is the only way to observe a watch session, since
   * {@link watch} itself resolves as soon as watching starts.
   */
  readonly onRun: (result: WatchRunResult) => void;
  /** Called while waiting on another process's write lock. */
  readonly onLockWait?: LockWaitListener;
  /** Called as locales and sub-batches start and finish, for progress reporting. */
  readonly onProgress?: ProgressListener;
  /**
   * How long, in milliseconds, to wait for a locale's write lock before that locale fails with
   * `LOCK_CONTENDED` on the run's summary. Defaults to ten minutes.
   */
  readonly lockAcquireTimeoutMs?: number;
  /**
   * How many locales to run at once. Defaults to 1. Validated once when watching starts, and
   * applied to every run.
   */
  readonly concurrency?: number;
  /** Consult and update the translation memory, fuzzy reuse included. Defaults to true. */
  readonly cache?: boolean;
}

/** Injectable dependencies for {@link watch}. Every field has a working default. */
export interface WatchDeps {
  /** Format-adapter registry to resolve the configured format. Defaults to the built-in registry. */
  readonly adapterRegistry?: AdapterRegistry;
  /** Provider factory. Defaults to constructing the provider named in the config. */
  readonly createProvider?: CreateProvider;
  /** File-system port. Defaults to the real file system. */
  readonly fs?: SdkFs;
  /** Watcher factory. Defaults to a chokidar-backed watcher over the source file. */
  readonly createWatcher?: CreateWatcher;
  /** Translation runner. Defaults to {@link translate} wired with the other dependencies. */
  readonly runTranslate?: RunTranslate;
}

/** The handle returned by {@link watch}, used to end the session. */
export interface WatchController {
  /** Stops watching and waits for any in-flight run to settle. Safe to call more than once. */
  stop(): Promise<void>;
}

/**
 * Watches the source locale file and re-runs {@link translate} on each debounced change. It is the
 * development-loop counterpart to a one-shot run: edit a string, and the target locales catch up
 * without a manual command.
 *
 * One run starts immediately once watching is established, without waiting for a change, so the
 * target locales are brought up to date the moment the session opens. Its outcome arrives through
 * `onRun` like any other, and it may still be in flight when the returned promise resolves.
 *
 * The returned promise resolves as soon as watching is established, not when translation finishes,
 * so every run outcome arrives through `onRun`. A run that throws is delivered as a failed
 * {@link WatchRunResult} rather than escaping the session, because a watcher that died on the first
 * bad save would be useless. Only startup problems throw: the inputs validated before any watching
 * begins, and a failure to construct the watcher itself.
 *
 * Rapid saves are coalesced by `debounceMs`, and runs never overlap, so an editor writing a file
 * several times in a moment produces one run rather than a queue of them.
 *
 * Call {@link WatchController.stop} to end the session.
 *
 * @param input - The config, the debounce window, and the run callback.
 * @param deps - Optional adapter registry, provider factory, file-system, watcher, and runner overrides.
 * @returns A controller that stops the session.
 *
 * @throws {@link SdkError} `UNKNOWN_LOCALE`: `locales` names a locale that is not a configured
 * target. Thrown once at startup, before any watching begins.
 * @throws {@link SdkError} `CONCURRENCY_INVALID`: `concurrency` is not an integer of at least 1.
 * @throws {@link SdkError} `CONCURRENCY_BUDGET_CONFLICT`: `concurrency` above 1 was combined with a
 * configured token budget.
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the `files.pattern` and `files.localeStyle`
 * cannot be combined, or a configured locale has no valid path spelling under that style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same path.
 * @throws {@link SdkError} `SOURCE_UNREADABLE`: the source locale file does not exist when watching
 * starts.
 * @throws Whatever the watcher factory raised, unwrapped, when it could not build a watcher over
 * the source file. It is not wrapped as an {@link SdkError}. No run has started at that point, so
 * nothing is watched and `onRun` is never called.
 *
 * @example
 * ```ts
 * import { loadConfig, watch } from "@verbatra/sdk";
 *
 * const config = await loadConfig();
 * const controller = await watch({
 *   config,
 *   onRun: (result) => {
 *     if (result.status === "failed") {
 *       console.error(`run failed: ${result.error.message}`);
 *       return;
 *     }
 *     console.log(`translated ${result.summary.succeeded.length} locales`);
 *   },
 * });
 *
 * process.on("SIGINT", () => void controller.stop());
 * ```
 */
export async function watch(input: WatchInput, deps: WatchDeps = {}): Promise<WatchController> {
  const cwd = input.cwd ?? process.cwd();
  const debounceMs = input.debounceMs ?? DEFAULT_DEBOUNCE_MS;
  const fs = deps.fs ?? defaultFs;

  selectLocales(input.config, input.locales);
  resolveRunConcurrency(input.concurrency, false, input.config);

  const resolver = createLocalePathResolver(cwd, input.config);
  const sourcePath = resolver.pathFor(input.config.sourceLocale);
  if (!(await fs.fileExists(sourcePath))) {
    throw new SdkError(
      "SOURCE_UNREADABLE",
      `The source locale file was not found at ${sourcePath}.`,
    );
  }

  const runTranslate = deps.runTranslate ?? defaultRunTranslate(deps);
  const runInput: TranslateInput = {
    config: input.config,
    cwd,
    ...(input.locales !== undefined ? { locales: input.locales } : {}),
    ...(input.onLockWait !== undefined ? { onLockWait: input.onLockWait } : {}),
    ...(input.onProgress !== undefined ? { onProgress: input.onProgress } : {}),
    ...(input.lockAcquireTimeoutMs !== undefined
      ? { lockAcquireTimeoutMs: input.lockAcquireTimeoutMs }
      : {}),
    ...(input.concurrency !== undefined ? { concurrency: input.concurrency } : {}),
    ...(input.cache !== undefined ? { cache: input.cache } : {}),
  };

  let state: "idle" | "running" = "idle";
  let pending = false;
  let stopped = false;
  let inFlight: Promise<void> | undefined;
  let debounceTimer: ReturnType<typeof setTimeout> | undefined;

  async function runOnce(): Promise<void> {
    try {
      input.onRun({ status: "succeeded", summary: await runTranslate(runInput) });
    } catch (error) {
      input.onRun({ status: "failed", error: describeError(error, "WATCH_RUN_FAILED") });
    }
  }

  function startRun(): void {
    state = "running";
    inFlight = runOnce().then(onRunComplete);
  }

  function onRunComplete(): void {
    if (stopped) {
      state = "idle";
      pending = false;
      inFlight = undefined;
      return;
    }
    if (pending) {
      pending = false;
      startRun();
      return;
    }
    state = "idle";
    inFlight = undefined;
  }

  function onSettledChange(): void {
    debounceTimer = undefined;
    if (state === "idle") {
      startRun();
    } else {
      pending = true;
    }
  }

  function onRawEvent(): void {
    if (stopped) {
      return;
    }
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
    }
    debounceTimer = setTimeout(onSettledChange, debounceMs);
  }

  const watcher = (deps.createWatcher ?? defaultCreateWatcher)([sourcePath]);
  watcher.onChange(onRawEvent);

  startRun();

  async function stop(): Promise<void> {
    stopped = true;
    pending = false;
    if (debounceTimer !== undefined) {
      clearTimeout(debounceTimer);
      debounceTimer = undefined;
    }
    await watcher.close();
    if (inFlight !== undefined) {
      await inFlight;
    }
  }

  return { stop };
}
