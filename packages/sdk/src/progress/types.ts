import type { LocaleSummary, UsageSummary } from "../flow/summary.js";

/**
 * Any event a run emits while it works. Discriminate on `type`. Progress is reported rather than
 * printed so that a CLI, a dashboard, and a CI log can each render it in their own way. A minor
 * version may add event types, so ignore a `type` you do not recognize.
 */
export type ProgressEvent =
  | LocaleStartedEvent
  | LocalePlannedEvent
  | SubBatchProgressEvent
  | BatchFinishedEvent
  | ProviderRetryEvent
  | RepairEvent
  | SplitRetryEvent
  | WritingEvent
  | LocaleFinishedEvent
  | RunFinishedEvent
  | ChangeDetectedEvent
  | IdleEvent;

/** Emitted when a locale's work begins. */
export interface LocaleStartedEvent {
  /** Discriminant for {@link ProgressEvent}. */
  readonly type: "locale-started";
  /** The locale starting. */
  readonly locale: string;
  /**
   * This locale's 0-based position among the run's locales. With concurrency above 1 several
   * locales are in flight at once, so these indices do not arrive in order.
   */
  readonly localeIndex: number;
  /** How many locales the run covers in total. */
  readonly totalLocales: number;
}

/**
 * Emitted once per locale that calls a provider, after the translation memory has been consulted
 * and before the first batch is sent. A dry run, an estimate, and a locale with nothing to
 * translate emit none.
 */
export interface LocalePlannedEvent {
  /** Discriminant for {@link ProgressEvent}. */
  readonly type: "locale-planned";
  /** The locale being planned. */
  readonly locale: string;
  /** How many distinct source strings will be sent to the provider. */
  readonly keys: number;
  /** How many batches those strings are split into; the `totalBatches` of its `sub-batch` events. */
  readonly batches: number;
  /** How many keys were served from the translation memory instead of the provider. */
  readonly cacheHits: number;
}

/**
 * Emitted as each sub-batch of a locale is reached, immediately before the provider call for it is
 * attempted. Large locales are split into batches, so this is the finer-grained signal to drive a
 * progress bar with.
 *
 * It announces an attempt rather than confirming a send: a batch withheld because the token budget
 * has already stopped the run still emits, and no provider call follows it. That is deliberate, so
 * that `batchIndex` always advances to `totalBatches` and a progress bar reaches its end instead of
 * stalling at the point the budget tripped.
 *
 * Only the translation batches emit it. A dry run sends nothing and emits none, and neither do the
 * plural-generation requests, so `totalBatches` counts translation batches alone. Keys served from
 * the translation memory are not batched, so a fully cached locale emits none either.
 */
export interface SubBatchProgressEvent {
  /** Discriminant for {@link ProgressEvent}. */
  readonly type: "sub-batch";
  /** The locale this batch belongs to. */
  readonly locale: string;
  /** This batch's 1-based position within the locale, counting up to `totalBatches`. */
  readonly batchIndex: number;
  /** How many batches the locale was split into. */
  readonly totalBatches: number;
}

/**
 * Emitted after each translation batch that a `sub-batch` event announced has finished, whether
 * the provider call succeeded, failed, or was withheld by the token budget.
 */
export interface BatchFinishedEvent {
  /** Discriminant for {@link ProgressEvent}. */
  readonly type: "batch-finished";
  /** The locale this batch belongs to. */
  readonly locale: string;
  /** This batch's 1-based position within the locale. */
  readonly batchIndex: number;
  /** How many batches the locale was split into. */
  readonly totalBatches: number;
  /** Wall-clock time the batch took, in milliseconds, including a repair round and any retry. */
  readonly durationMs: number;
  /** Tokens the batch consumed, when the provider reported usage. */
  readonly usage?: UsageSummary;
}

/**
 * Emitted when a built-in provider retries a request that failed with a retryable status, before
 * it waits. The provider is shared by every locale of a run, so the event names no locale. The
 * Gemini provider reports the delay and the status; the Anthropic, OpenAI and openai-compatible
 * providers report the attempt only, when their client starts it. DeepL and Google Cloud
 * Translation report none.
 */
export interface ProviderRetryEvent {
  /** Discriminant for {@link ProgressEvent}. */
  readonly type: "provider-retry";
  /** The 1-based attempt about to be made: `2` for the first retry. */
  readonly attempt: number;
  /** How long the provider waits before the attempt, in milliseconds, when it is known. */
  readonly delayMs?: number;
  /** The HTTP status of the failed attempt, when it is known. */
  readonly status?: number;
}

/**
 * Emitted when an LLM provider's response left keys out and it re-requests them in its one bounded
 * repair round.
 */
export interface RepairEvent {
  /** Discriminant for {@link ProgressEvent}. */
  readonly type: "repair";
  /** The locale being repaired. */
  readonly locale: string;
  /** How many keys the repair round re-requests. */
  readonly keys: number;
}

/**
 * Emitted when a batch's output was cut off at the token limit and the batch is retried in two
 * halves.
 */
export interface SplitRetryEvent {
  /** Discriminant for {@link ProgressEvent}. */
  readonly type: "split-retry";
  /** The locale the batch belongs to. */
  readonly locale: string;
  /** How many keys the batch held before it was split. */
  readonly keys: number;
}

/** Emitted just before a locale's target file is written. A dry run writes nothing and emits none. */
export interface WritingEvent {
  /** Discriminant for {@link ProgressEvent}. */
  readonly type: "writing";
  /** The locale whose file is about to be written. */
  readonly locale: string;
}

/**
 * Emitted by {@link watch} when a change to the source file has settled, after the debounce and
 * before the run it triggers starts or is queued behind the run in flight.
 */
export interface ChangeDetectedEvent {
  /** Discriminant for {@link ProgressEvent}. */
  readonly type: "change-detected";
  /** Absolute paths of the watched files the change touched. */
  readonly paths: readonly string[];
}

/** Emitted by {@link watch} each time a run finishes and no further run is queued. */
export interface IdleEvent {
  /** Discriminant for {@link ProgressEvent}. */
  readonly type: "idle";
}

/** Emitted when a locale's work ends, whether it succeeded, partially succeeded, or failed. */
export interface LocaleFinishedEvent {
  /** Discriminant for {@link ProgressEvent}. */
  readonly type: "locale-finished";
  /** The locale that finished. */
  readonly locale: string;
  /** The locale's {@link LocaleSummary.status}: `succeeded`, `partial`, or `failed`. */
  readonly status: LocaleSummary["status"];
  /** The length of the locale's {@link LocaleSummary.translated} list. */
  readonly translated: number;
  /** This locale's 0-based position among the run's locales. */
  readonly localeIndex: number;
  /** How many locales the run covers in total. */
  readonly totalLocales: number;
}

/**
 * Emitted once, after every locale has finished. Not emitted when the run rejects part way, as it
 * does on a corrupt lock-file.
 */
export interface RunFinishedEvent {
  /** Discriminant for {@link ProgressEvent}. */
  readonly type: "run-finished";
  /** How many locales completed, including those that failed. */
  readonly localesCompleted: number;
  /** How many of the completed locales failed. A locale a cancelled run never started is not counted. */
  readonly localesFailed: number;
}

/**
 * Called for each {@link ProgressEvent} a run emits. Passed as `onProgress` to {@link translate}
 * and {@link watch}.
 */
export type ProgressListener = (event: ProgressEvent) => void;

/**
 * Emitted while {@link extract}, {@link diff} with `unused`, or {@link doctor} with `literals` scans
 * application source: once after each file is read.
 */
export interface ScanProgressEvent {
  /** Discriminant, reserved so later scan events can join a union. */
  readonly type: "files-scanned";
  /** How many files have been scanned so far. */
  readonly scanned: number;
  /** How many files the scan will read in total. */
  readonly total: number;
}

/**
 * Called for each {@link ScanProgressEvent}. Passed as `onProgress` to {@link extract}, {@link diff},
 * and {@link doctor}.
 */
export type ScanProgressListener = (event: ScanProgressEvent) => void;
