import { z } from "zod";
import type { UsageSummary } from "../flow/summary.js";

export const RUN_HISTORY_VERSION = 1;

export const RUN_HISTORY_TRIGGERS = ["translate", "retranslate"] as const;

/**
 * What produced a {@link RunHistoryRecord}: `translate` for a {@link translate} run (which is also
 * what {@link watch}, the Studio translate-pending action and the `translation.translatePending`
 * MCP tool run), `retranslate` for one {@link retranslateEntry} call or one
 * {@link retranslateEntries} batch.
 */
export type RunHistoryTrigger = (typeof RUN_HISTORY_TRIGGERS)[number];

/** Every {@link RunCostBasis}. */
export const RUN_COST_BASES = ["usage", "source-characters"] as const;

/**
 * Where a run's cost figure comes from: `usage` is the token usage the provider reported, priced at
 * the rate on file; `source-characters` is an estimate for a machine-translation provider that
 * reports no usage, the source characters of the keys sent to it, priced at the rate on file.
 */
export type RunCostBasis = (typeof RUN_COST_BASES)[number];

export const RUN_COST_CAVEATS = [
  "SOURCE_DUPLICATES_NOT_DEDUPLICATED",
  "TRANSPORT_RETRIES_NOT_COUNTED",
  "USAGE_PARTIAL",
] as const;

/**
 * What a cost figure leaves out. `SOURCE_DUPLICATES_NOT_DEDUPLICATED` and
 * `TRANSPORT_RETRIES_NOT_COUNTED` mark a `source-characters` estimate, with the meaning the same
 * code has on a run estimate; keys the provider failed on are not counted either, and the locale's
 * `providerFailures` says how many. `USAGE_PARTIAL` marks a `usage` figure that is a lower bound,
 * whether or not a rate was found: at least one locale sent keys and reported no tokens, so the
 * amount, when there is one, and the recorded token count cover only what was reported. A locale that reported usage for some of its sub-batches but not all cannot be told
 * apart, and shows no mark.
 */
export type RunCostCaveat = (typeof RUN_COST_CAVEATS)[number];

export const RUN_COST_UNPRICED = ["no-rate-on-file", "rate-unit-mismatch", "no-usage"] as const;

const MAX_LOCALE_NAME_LENGTH = 64;
const MAX_PROVIDER_LENGTH = 64;
const MAX_MODEL_LENGTH = 200;

export const RUN_HISTORY_LIMITS = {
  locale: MAX_LOCALE_NAME_LENGTH,
  model: MAX_MODEL_LENGTH,
  rateKey: MAX_PROVIDER_LENGTH + MAX_MODEL_LENGTH + 1,
} as const;

const HIGH_SURROGATE_START = 0xd800;
const HIGH_SURROGATE_END = 0xdbff;

export function clipText(text: string, max: number): string {
  if (text.length <= max) {
    return text;
  }
  const last = text.charCodeAt(max - 1);
  const splitsPair = last >= HIGH_SURROGATE_START && last <= HIGH_SURROGATE_END;
  return text.slice(0, splitsPair ? max - 1 : max);
}

const countSchema = z.number().int().nonnegative();

export const runHistoryUsageSchema = z.object({
  inputTokens: countSchema,
  outputTokens: countSchema,
});

export const runHistoryCoverageSchema = z.object({
  missing: countSchema,
  stale: countSchema,
  upToDate: countSchema,
});

export const runHistoryLocaleSchema = z.object({
  locale: z.string().min(1).max(MAX_LOCALE_NAME_LENGTH),
  status: z.enum(["succeeded", "partial", "failed"]),
  translated: countSchema.default(0),
  cacheHits: countSchema.default(0),
  fuzzyHits: countSchema.default(0),
  generated: countSchema.default(0),
  pruned: countSchema.default(0),
  integrityMismatches: countSchema.default(0),
  providerFailures: countSchema.default(0),
  usage: runHistoryUsageSchema.optional(),
  coverage: runHistoryCoverageSchema.optional(),
});

const rateKeySchema = z.string().min(1).max(RUN_HISTORY_LIMITS.rateKey);

const caveatsSchema = z
  .array(z.enum(RUN_COST_CAVEATS))
  .max(RUN_COST_CAVEATS.length)
  .readonly()
  .optional();

export const runHistoryCostSchema = z.discriminatedUnion("pricing", [
  z.object({
    pricing: z.literal("priced"),
    basis: z.enum(RUN_COST_BASES),
    rateKey: rateKeySchema,
    currency: z.string().regex(/^[A-Z]{3}$/),
    asOf: z.iso.date(),
    amount: z.number().nonnegative(),
    caveats: caveatsSchema,
  }),
  z.object({
    pricing: z.enum(RUN_COST_UNPRICED),
    basis: z.enum(RUN_COST_BASES),
    rateKey: rateKeySchema,
    caveats: caveatsSchema,
  }),
  z.object({
    pricing: z.literal("not-billed"),
    rateKey: rateKeySchema,
  }),
]);

export const runHistoryRecordSchema = z.object({
  version: z.literal(RUN_HISTORY_VERSION),
  at: z.iso.datetime(),
  trigger: z.enum(RUN_HISTORY_TRIGGERS),
  provider: z.string().min(1).max(MAX_PROVIDER_LENGTH),
  model: z.string().min(1).max(MAX_MODEL_LENGTH).optional(),
  entries: countSchema.optional(),
  usage: runHistoryUsageSchema.optional(),
  cost: runHistoryCostSchema,
  locales: z.array(runHistoryLocaleSchema).readonly(),
  localesOmitted: countSchema.optional(),
  coverageUnavailable: z.literal(true).optional(),
});

export type RunHistoryRecordParsed = z.output<typeof runHistoryRecordSchema>;

/** Every {@link RunHistoryUnavailableReason}. */
export const RUN_HISTORY_UNAVAILABLE_REASONS = Object.freeze(["unreadable", "too-large"] as const);

/**
 * Why the whole run-history file could not be read, which {@link runHistory} reports instead of an
 * error: `unreadable` when something exists at the path but the process could not read it as a
 * regular file, `too-large` when it is over 8 MiB. A missing file is not unavailable, it is an
 * empty history, and a line that is not valid UTF-8 is one unreadable record, not an unavailable
 * file.
 */
export type RunHistoryUnavailableReason = (typeof RUN_HISTORY_UNAVAILABLE_REASONS)[number];

/**
 * The zod schema for a {@link RunHistoryResult}, the result of {@link runHistory}. Published as
 * `run-history-result.json`.
 */
export const runHistoryResultSchema = z.object({
  records: z.array(runHistoryRecordSchema).readonly(),
  total: countSchema,
  unreadableRecords: countSchema,
  unavailable: z.enum(RUN_HISTORY_UNAVAILABLE_REASONS).optional(),
});

/**
 * How far a locale is translated, measured by a {@link check} pass after the run: the same three
 * counts {@link LocaleCheckSummary} reports.
 */
export interface RunHistoryCoverage {
  /** Source keys with a non-blank value and no translation in the locale yet. */
  readonly missing: number;
  /** Keys whose source text changed since the locale was last translated. */
  readonly stale: number;
  /** Keys whose translation still matches the source recorded in the lock-file. */
  readonly upToDate: number;
}

/** One locale's part of a {@link RunHistoryRecord}: counts only, never a key name or a text. */
export interface RunHistoryLocale {
  /** The target locale. */
  readonly locale: string;
  /** How the locale finished, as in {@link LocaleSummary.status}. */
  readonly status: "succeeded" | "partial" | "failed";
  /** Keys that received a new value from the provider. */
  readonly translated: number;
  /** Keys served from the translation memory instead of the provider. */
  readonly cacheHits: number;
  /** Keys reused from the translation memory for a changed source string. */
  readonly fuzzyHits: number;
  /** Plural forms generated for the target language. */
  readonly generated: number;
  /** Orphaned keys removed from the locale. */
  readonly pruned: number;
  /** Keys whose translation the integrity gate refused. */
  readonly integrityMismatches: number;
  /** Keys the provider failed to translate. */
  readonly providerFailures: number;
  /** Token usage for this locale, absent when the provider reports none. */
  readonly usage?: UsageSummary | undefined;
  /**
   * Coverage measured after the run. Absent for a locale that was not measured, including every
   * locale of a record with `coverageUnavailable`.
   */
  readonly coverage?: RunHistoryCoverage | undefined;
}

/**
 * What a run cost, frozen when the record was written from the `rates` the config held then.
 * `pricing` says whether a rate was found; only `priced` carries `currency`, `asOf` and `amount`.
 * A `source-characters` figure is an estimate, never an invoice: show it as one.
 */
export type RunHistoryCost =
  | {
      /** A rate for the provider and model was on file and applied. */
      readonly pricing: "priced";
      /** Where the quantity comes from. */
      readonly basis: RunCostBasis;
      /** The `provider/model` or bare provider id the rate was looked up under. */
      readonly rateKey: string;
      /** The three-letter currency code of the rate card at the time. */
      readonly currency: string;
      /** The `asOf` date of the rate card at the time, as `YYYY-MM-DD`. */
      readonly asOf: string;
      /** The cost in `currency`. */
      readonly amount: number;
      /** What a `source-characters` figure leaves out. Absent for `usage`. */
      readonly caveats?: readonly RunCostCaveat[] | undefined;
    }
  | {
      /**
       * Why no figure exists: no rate on file, a rate in the wrong unit, or keys were sent to a
       * token-billed provider that reported no usage (`no-usage`). Show it as unknown, never as
       * free.
       */
      readonly pricing: "no-rate-on-file" | "rate-unit-mismatch" | "no-usage";
      /** Where the quantity would have come from. */
      readonly basis: RunCostBasis;
      /** The `provider/model` or bare provider id looked up. */
      readonly rateKey: string;
      /** What a `source-characters` figure leaves out. Absent for `usage`. */
      readonly caveats?: readonly RunCostCaveat[] | undefined;
    }
  | {
      /** The provider is self-hosted or `none`, so no API bills for the run. */
      readonly pricing: "not-billed";
      /** The `provider/model` or bare provider id looked up. */
      readonly rateKey: string;
    };

/**
 * One finished run in the local run history. It holds counts, usage and cost only: no key name and
 * no translation text, which is why the history file can sit in `.verbatra-local` and never needs
 * committing.
 */
export interface RunHistoryRecord {
  /** The record format version, `1`. */
  readonly version: 1;
  /** When the record was written, an ISO 8601 UTC timestamp. */
  readonly at: string;
  /** What produced the run. */
  readonly trigger: RunHistoryTrigger;
  /** The configured provider's id. */
  readonly provider: string;
  /** The configured model, when the provider has one. */
  readonly model?: string | undefined;
  /**
   * The number of keys a `retranslate` record covers: one for {@link retranslateEntry}, and for
   * {@link retranslateEntries} the number of entries attempted, that is, whose provider call was
   * made, whether it answered, was refused by the integrity gate or failed. Absent for `translate`.
   */
  readonly entries?: number | undefined;
  /** Token usage of the whole run, absent when the provider reports none or nothing was sent. */
  readonly usage?: UsageSummary | undefined;
  /** What the run cost, frozen at write. */
  readonly cost: RunHistoryCost;
  /** The locales the run touched, with their counts. */
  readonly locales: readonly RunHistoryLocale[];
  /** How many locales were left out of `locales` to keep the record small. Absent when none. */
  readonly localesOmitted?: number | undefined;
  /** `true` when the coverage pass after the run failed, so no locale carries `coverage`. */
  readonly coverageUnavailable?: true | undefined;
}

const ZERO_DEFAULTED = [
  "translated",
  "cacheHits",
  "fuzzyHits",
  "generated",
  "pruned",
  "integrityMismatches",
  "providerFailures",
] as const;

type ParsedLocale = z.output<typeof runHistoryLocaleSchema>;

function compactLocale(locale: ParsedLocale): Record<string, unknown> {
  const compact: Record<string, unknown> = { ...locale };
  for (const field of ZERO_DEFAULTED) {
    if (locale[field] === 0 && field !== "translated") {
      delete compact[field];
    }
  }
  return compact;
}

export function serializeRunHistoryRecord(record: RunHistoryRecordParsed): string {
  return JSON.stringify({ ...record, locales: record.locales.map(compactLocale) });
}

export const MAX_RUN_HISTORY_RECORD_BYTES = 16 * 1024;

export function fitRecord(record: RunHistoryRecordParsed): string {
  let kept = record.locales.length;
  let line = serializeRunHistoryRecord(record);
  while (Buffer.byteLength(line) > MAX_RUN_HISTORY_RECORD_BYTES && kept > 0) {
    kept = Math.floor(kept / 2);
    line = serializeRunHistoryRecord({
      ...record,
      locales: record.locales.slice(0, kept),
      localesOmitted: record.locales.length - kept,
    });
  }
  return line;
}
