/**
 * Any event a run emits while it works. Discriminate on `type`. Progress is reported rather than
 * printed so that a CLI, a dashboard, and a CI log can each render it in their own way.
 */
export type ProgressEvent =
  | LocaleStartedEvent
  | SubBatchProgressEvent
  | LocaleFinishedEvent
  | RunFinishedEvent;

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

/** Emitted when a locale's work ends, whether it succeeded, partially succeeded, or failed. */
export interface LocaleFinishedEvent {
  /** Discriminant for {@link ProgressEvent}. */
  readonly type: "locale-finished";
  /** The locale that finished. */
  readonly locale: string;
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
}

/**
 * Called for each {@link ProgressEvent} a run emits. Passed as `onProgress` to {@link translate}
 * and {@link watch}.
 */
export type ProgressListener = (event: ProgressEvent) => void;
