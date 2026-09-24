import { ProviderError } from "@verbatra/ai-providers";
import { AdapterError } from "@verbatra/format-adapters";
import type { VerbatraConfig } from "../config/schema.js";
import { SdkError } from "../errors.js";
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
  /** Free text naming the reviewer, applied to every entry, with the rules of {@link ReviewDecisionInput.reviewer}. */
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
  | BatchEntryFailure;

/** Input for {@link retranslateEntries}. */
export interface RetranslateEntriesInput {
  /** The resolved project config, normally from {@link loadConfig}. */
  readonly config: VerbatraConfig;
  /** Directory the `files.pattern` is resolved against. Defaults to the process working directory. */
  readonly cwd?: string;
  /** The entries to retranslate, in the order they are carried out. */
  readonly entries: readonly BatchEntry[];
  /** Replace values a person wrote too, as {@link RetranslateEntryInput.includeHuman} does for one entry. Defaults to false. */
  readonly includeHuman?: boolean;
}

/** The outcome of {@link retranslateEntries}. */
export interface RetranslateEntriesResult {
  /** One outcome per requested entry, in the order the entries were given. */
  readonly results: readonly RetranslateBatchOutcome[];
}

function isEntryError(error: unknown): error is Error & { readonly code: string } {
  return (
    error instanceof SdkError || error instanceof AdapterError || error instanceof ProviderError
  );
}

async function runEntries<E extends BatchEntry, R>(
  entries: readonly E[],
  run: (entry: E) => Promise<R>,
): Promise<readonly (R | BatchEntryFailure)[]> {
  const outcomes: (R | BatchEntryFailure)[] = [];
  for (const entry of entries) {
    try {
      outcomes.push(await run(entry));
    } catch (error) {
      if (!isEntryError(error)) {
        throw error;
      }
      outcomes.push({
        locale: entry.locale,
        key: entry.key,
        ok: false,
        code: error.code,
        message: redact(error.message),
      });
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
 * entry, so it is thrown and the entries after it are not decided.
 *
 * @param input - The config, the entries with the values the reviewer saw, and an optional reviewer.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns One outcome per entry, in the order the entries were given.
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
 * error is thrown, and the entries after it are not decided.
 *
 * @param input - The config, the entries with the values the reviewer saw, and an optional reviewer.
 * @param deps - Optional adapter registry and file-system overrides.
 * @returns One outcome per entry, in the order the entries were given.
 */
export async function rejectEntries(
  input: ReviewEntriesInput,
  deps: ReviewDecisionDeps = {},
): Promise<ReviewEntriesResult> {
  return decideEntries(rejectEntry, input, deps);
}

/**
 * Retranslates several keys in one call, one {@link retranslateEntry} per entry, in the order
 * given. Each entry is one provider call, so the batch spends up to one call per entry.
 *
 * Every entry follows the rules of {@link retranslateEntry}: its result goes through the integrity
 * gate before anything is written, a refused value is reported as data, and a value a person
 * wrote is refused with `KEY_PROTECTED` unless `includeHuman` is set. An entry that fails does
 * not stop the batch; it is reported in `results` with the code and message of the error, the
 * message redacted. An error that is not an {@link SdkError}, an adapter error, or a provider
 * error is thrown, and the entries after it are not retranslated.
 *
 * @param input - The config, the entries, and whether values a person wrote may be replaced.
 * @param deps - Optional adapter registry, provider factory, and file-system overrides.
 * @returns One outcome per entry, in the order the entries were given.
 */
export async function retranslateEntries(
  input: RetranslateEntriesInput,
  deps: RetranslateEntryDeps = {},
): Promise<RetranslateEntriesResult> {
  const results = await runEntries(input.entries, async (entry) => {
    const result = await retranslateEntry(
      {
        config: input.config,
        ...(input.cwd !== undefined ? { cwd: input.cwd } : {}),
        locale: entry.locale,
        key: entry.key,
        ...(input.includeHuman === true ? { includeHuman: true } : {}),
      },
      deps,
    );
    return { locale: entry.locale, key: entry.key, ok: true as const, result };
  });
  return { results };
}
