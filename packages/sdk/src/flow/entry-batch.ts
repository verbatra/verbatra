import { ProviderError } from "@verbatra/ai-providers";
import { AdapterError } from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import { errorMessage, SdkError } from "../errors.js";
import type { LockWaitListener } from "../lock/locale-write-lock.js";
import { redact } from "../redact.js";
import {
  type RetranslateEntryDeps,
  type RetranslateEntryResult,
  retranslateEntry,
} from "./retranslate-entry.js";
import {
  approveEntry,
  type ReviewDecisionDeps,
  type ReviewDecisionInput,
  type ReviewDecisionResult,
  rejectEntry,
} from "./review-decision.js";

/** One entry of a batch: a target locale and a key. */
export interface BatchEntry {
  /** The target locale the entry belongs to. */
  readonly locale: string;
  /** The key within that locale. */
  readonly key: string;
}

/** One entry of a review batch for {@link approveEntries} or {@link rejectEntries}. */
export interface ReviewBatchEntry extends BatchEntry {
  /** The translation the reviewer saw; the entry fails unless it is the key's current value. */
  readonly expectedValue: string;
}

/** An entry of a batch that did not complete, with the error that stopped it. */
export interface BatchEntryFailure extends BatchEntry {
  /** Always `false`: the entry was not carried out. */
  readonly ok: false;
  /**
   * The code of the error that stopped the entry: an {@link SdkErrorCode}, or the code of the
   * adapter or provider error it passed through.
   */
  readonly code: string;
  /** A human-readable description of the failure, with any secret redacted. */
  readonly message: string;
}

/**
 * An entry of {@link retranslateEntries} that was not attempted, because an earlier entry failed
 * with an error that would fail every entry, such as a missing API key.
 */
export interface BatchEntrySkipped extends BatchEntry {
  /** Always `false`: the entry was not carried out. */
  readonly ok: false;
  /** Always `true`: the entry was skipped rather than tried. */
  readonly skipped: true;
  /** The code of the earlier error that stopped the batch. */
  readonly code: string;
  /** A human-readable description naming that error, with any secret redacted. */
  readonly message: string;
}

/** The outcome of one entry of {@link approveEntries} or {@link rejectEntries}. */
export type ReviewBatchOutcome =
  | ({
      /** Always `true`: the decision was recorded. */
      readonly ok: true;
    } & ReviewDecisionResult)
  | BatchEntryFailure;

/** Input for {@link approveEntries} and {@link rejectEntries}. */
export interface ReviewEntriesInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /** The entries to decide on, in the order they are carried out. */
  readonly entries: readonly ReviewBatchEntry[];
  /**
   * Free text naming the reviewer, applied to every entry, with the rules of
   * {@link ReviewDecisionInput.reviewer}.
   */
  readonly reviewer?: string;
}

/** The outcome of {@link approveEntries} or {@link rejectEntries}. */
export interface ReviewEntriesResult {
  /** One outcome per requested entry, in the order the entries were given. */
  readonly results: readonly ReviewBatchOutcome[];
}

/** The outcome of one entry of {@link retranslateEntries}. */
export type RetranslateBatchOutcome =
  | (BatchEntry & {
      /** Always `true`: the provider was called and its answer went through the integrity gate. */
      readonly ok: true;
      /** What the single-entry retranslation reported, including a value the gate refused. */
      readonly result: RetranslateEntryResult;
    })
  | BatchEntryFailure
  | BatchEntrySkipped;

/** Input for {@link retranslateEntries}. */
export interface RetranslateEntriesInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /** The entries to retranslate, in the order they are carried out. */
  readonly entries: readonly BatchEntry[];
  /**
   * Replace values a person wrote too, as {@link RetranslateEntryInput.includeHuman} does for one
   * entry. Defaults to false.
   */
  readonly includeHuman?: boolean;
  /**
   * Called while an entry waits on another process's write lock for its locale. Never called for
   * a lock this process holds itself.
   */
  readonly onLockWait?: LockWaitListener;
  /**
   * How long, in milliseconds, each entry waits for its locale's write lock before it fails with
   * `LOCK_CONTENDED`, as {@link RetranslateEntryInput.lockAcquireTimeoutMs} does for one entry. The
   * wait happens before the provider is called. Defaults to ten minutes per entry.
   */
  readonly lockAcquireTimeoutMs?: number;
}

/** The outcome of {@link retranslateEntries}. */
export interface RetranslateEntriesResult {
  /** One outcome per requested entry, in the order the entries were given. */
  readonly results: readonly RetranslateBatchOutcome[];
}

/**
 * Thrown by {@link approveEntries}, {@link rejectEntries}, and {@link retranslateEntries} when an
 * error that is not the outcome of one entry stops a batch part way, such as an unexpected
 * file-system failure. The entries before it were carried out and their writes are on disk; the
 * entry it names and every entry after it were not. The original error is the `cause`.
 */
export class BatchInterruptedError<R = ReviewBatchOutcome | RetranslateBatchOutcome> extends Error {
  /** The outcomes of the entries completed before the batch stopped, in the order given. */
  readonly results: readonly R[];
  /** The entry the batch was carrying out when it stopped. */
  readonly entry: BatchEntry;

  /**
   * @param results - The outcomes of the entries completed before the interruption.
   * @param entry - The entry that was being carried out.
   * @param cause - The error that stopped the batch.
   */
  constructor(results: readonly R[], entry: BatchEntry, cause: unknown) {
    super(
      `The batch stopped at "${entry.key}" in ${entry.locale} after ${results.length} ` +
        `completed ${results.length === 1 ? "entry" : "entries"}: ${redact(errorMessage(cause))}`,
      { cause },
    );
    this.name = "BatchInterruptedError";
    this.results = results;
    this.entry = { locale: entry.locale, key: entry.key };
  }
}

function isEntryError(error: unknown): error is Error & { readonly code: string } {
  return (
    error instanceof SdkError || error instanceof AdapterError || error instanceof ProviderError
  );
}

const BATCH_WIDE_CODES: ReadonlySet<string> = new Set([
  "MISSING_API_KEY",
  "AUTH_FAILED",
  "RATE_LIMITED",
  "NETWORK_POLICY_VIOLATION",
  "PROVIDER_CONSTRUCTION_FAILED",
  "MACHINE_TRANSLATION_DISABLED",
  "CONFIG_INVALID",
]);

function isBatchWide(error: Error & { readonly code: string }): boolean {
  return (
    (error instanceof ProviderError || error instanceof SdkError) &&
    BATCH_WIDE_CODES.has(error.code)
  );
}

function failureOf(entry: BatchEntry, error: Error & { readonly code: string }): BatchEntryFailure {
  return {
    locale: entry.locale,
    key: entry.key,
    ok: false,
    code: error.code,
    message: redact(error.message),
  };
}

function skippedAfter(
  entries: readonly BatchEntry[],
  cause: Error & { readonly code: string },
): BatchEntrySkipped[] {
  return entries.map((entry) => ({
    locale: entry.locale,
    key: entry.key,
    ok: false,
    skipped: true,
    code: cause.code,
    message: `Not attempted: an earlier entry failed with ${cause.code}, which would fail this one too.`,
  }));
}

type SkipRest<E, S> = (rest: readonly E[], cause: Error & { readonly code: string }) => S[];

async function runEntries<E extends BatchEntry, R, S = never>(
  entries: readonly E[],
  run: (entry: E) => Promise<R>,
  skipRest?: SkipRest<E, S>,
): Promise<readonly (R | BatchEntryFailure | S)[]> {
  const outcomes: (R | BatchEntryFailure | S)[] = [];
  for (const [index, entry] of entries.entries()) {
    try {
      outcomes.push(await run(entry));
    } catch (error) {
      if (!isEntryError(error)) {
        throw new BatchInterruptedError(outcomes, entry, error);
      }
      outcomes.push(failureOf(entry, error));
      if (skipRest !== undefined && isBatchWide(error)) {
        outcomes.push(...skipRest(entries.slice(index + 1), error));
        break;
      }
    }
  }
  return outcomes;
}

type ReviewDecision = (
  input: ReviewDecisionInput,
  deps: ReviewDecisionDeps,
) => Promise<ReviewDecisionResult>;

async function decideEntries(
  decide: ReviewDecision,
  input: ReviewEntriesInput,
  deps: ReviewDecisionDeps,
): Promise<ReviewEntriesResult> {
  const results = await runEntries(input.entries, async (entry) => {
    const result = await decide(
      {
        config: input.config,
        ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
        locale: entry.locale,
        key: entry.key,
        expectedValue: entry.expectedValue,
        ...(input.reviewer !== undefined ? { reviewer: input.reviewer } : {}),
      },
      deps,
    );
    return { ok: true as const, ...result };
  });
  return { results };
}

/**
 * Approves several reviewed translations in one call, one {@link approveEntry} per entry, in the
 * order given. It writes only the provenance file and calls no provider.
 *
 * Every entry is decided on its own, with the rules of {@link approveEntry}: it is refused unless
 * the key's current translation is its `expectedValue` and is up to date with its source. A
 * refused entry does not stop the batch; it is reported in `results` with the code and message
 * of the error that refused it, the message redacted, and the next entry is decided. An error
 * that is not an {@link SdkError}, an adapter error, or a provider error is not an outcome of one
 * entry, so the batch stops there and throws a {@link BatchInterruptedError} carrying the outcomes
 * of the entries already decided, with that error as its `cause`.
 *
 * @param input - The config, the entries with the values the reviewer saw, and an optional
 * reviewer.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns One outcome per entry, in the order the entries were given.
 * @throws {@link BatchInterruptedError}: an unexpected error stopped the batch part way.
 */
export async function approveEntries(
  input: ReviewEntriesInput,
  deps: ReviewDecisionDeps = {},
): Promise<ReviewEntriesResult> {
  return decideEntries(approveEntry, input, deps);
}

/**
 * Rejects several reviewed translations in one call, one {@link rejectEntry} per entry, in the
 * order given, removing each rejected translation so it gets replaced. It calls no provider.
 *
 * Every entry is decided on its own, with the rules of {@link rejectEntry}: it is refused unless
 * the key's current translation is its `expectedValue`, and a format that cannot drop a single
 * translation refuses it. A refused entry does not stop the batch; it is reported in `results`
 * with the code and message of the error that refused it, the message redacted, and the next
 * entry is decided. An error that is not an {@link SdkError}, an adapter error, or a provider
 * error stops the batch with a {@link BatchInterruptedError} carrying the outcomes of the entries
 * already decided, with that error as its `cause`.
 *
 * @param input - The config, the entries with the values the reviewer saw, and an optional
 * reviewer.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns One outcome per entry, in the order the entries were given.
 * @throws {@link BatchInterruptedError}: an unexpected error stopped the batch part way.
 */
export async function rejectEntries(
  input: ReviewEntriesInput,
  deps: ReviewDecisionDeps = {},
): Promise<ReviewEntriesResult> {
  return decideEntries(rejectEntry, input, deps);
}

/**
 * Retranslates several keys in one call, one {@link retranslateEntry} per entry, in the order
 * given. Each entry is one provider call, so the batch spends up to one call per entry. It is not
 * a {@link translate} run: `maxTokens` and `budgetBehavior` do not apply to it, so the only bound
 * on its spend is the number of entries.
 *
 * Every entry follows the rules of {@link retranslateEntry}: its result goes through the integrity
 * gate before anything is written, a refused value is reported as data, and a value a person
 * wrote is refused with `KEY_PROTECTED` unless `includeHuman` is set. An entry that fails does
 * not stop the batch; it is reported in `results` with the code and message of the error, the
 * message redacted. The exception is an error that would fail every entry alike: a missing or
 * rejected API key (`MISSING_API_KEY`, `AUTH_FAILED`), a rate limit or exhausted quota
 * (`RATE_LIMITED`), a provider that cannot be constructed (`PROVIDER_CONSTRUCTION_FAILED`), a
 * network policy that forbids the provider (`NETWORK_POLICY_VIOLATION`), an invalid network policy
 * setting (`CONFIG_INVALID`), or `provider: { id: "none" }` (`MACHINE_TRANSLATION_DISABLED`). The
 * entry that hit it is reported as failed and every entry after it as a {@link BatchEntrySkipped}
 * naming that code, without another provider call. An error that is not an {@link SdkError}, an
 * adapter error, or a provider error stops the batch with a {@link BatchInterruptedError} carrying
 * the outcomes of the entries already retranslated.
 *
 * @param input - The config, the entries, whether values a person wrote may be replaced, and how
 * long each entry may wait for its locale's write lock.
 * @param deps - Optional adapter registry, provider factory, and file-system overrides.
 * @returns One outcome per entry, in the order the entries were given.
 * @throws {@link BatchInterruptedError}: an unexpected error stopped the batch part way.
 */
export async function retranslateEntries(
  input: RetranslateEntriesInput,
  deps: RetranslateEntryDeps = {},
): Promise<RetranslateEntriesResult> {
  const results = await runEntries(
    input.entries,
    async (entry) => {
      const result = await retranslateEntry(
        {
          config: input.config,
          ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
          locale: entry.locale,
          key: entry.key,
          ...(input.includeHuman === true ? { includeHuman: true } : {}),
          ...(input.onLockWait !== undefined ? { onLockWait: input.onLockWait } : {}),
          ...(input.lockAcquireTimeoutMs !== undefined
            ? { lockAcquireTimeoutMs: input.lockAcquireTimeoutMs }
            : {}),
        },
        deps,
      );
      return { locale: entry.locale, key: entry.key, ok: true as const, result };
    },
    skippedAfter,
  );
  return { results };
}
