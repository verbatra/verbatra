import type { ProviderNotice, ReviewReasonCode } from "@verbatra/ai-providers";
import type { BillingUnit } from "../config/provider-billing.js";
import type { ProviderId } from "../config/provider-config.js";

/**
 * Conditions the SDK itself reports on a locale, as opposed to the {@link ProviderNotice} codes a
 * provider raises. Each marks a run that completed but did something a caller may want to know
 * about.
 *
 * - `PLURAL_CATEGORIES_INCOMPLETE`: plural generation could not produce every category the target
 *   language requires, so the entry is written with the categories that were produced.
 * - `SUB_BATCH_FAILED`: one sub-batch of a locale failed while others succeeded. The locale is
 *   reported as `partial` rather than failed.
 * - `BLANK_ROW_BASELINE_RETAINED`: an imported handoff row was blank, so the existing translation
 *   and its lock-file baseline were kept rather than being erased.
 * - `BUDGET_TOKENS_EXCEEDED`: the configured token budget was passed. Under `warn` the run
 *   continues; under `stop` the remaining keys are withheld.
 * - `CACHE_VERSION_UNRECOGNIZED`: the translation memory is at a version this release does not
 *   understand, so it was ignored rather than trusted.
 */
export type SdkNoticeCode =
  | "PLURAL_CATEGORIES_INCOMPLETE"
  | "SUB_BATCH_FAILED"
  | "BLANK_ROW_BASELINE_RETAINED"
  | "BUDGET_TOKENS_EXCEEDED"
  | "CACHE_VERSION_UNRECOGNIZED";

/**
 * Token usage as reported by the provider. Absent when the provider does not report usage, which is
 * the case for machine-translation APIs such as DeepL that do not bill in tokens.
 */
export interface UsageSummary {
  /** Tokens consumed by the prompts sent to the provider. */
  readonly inputTokens: number;
  /** Tokens consumed by the provider's responses. */
  readonly outputTokens: number;
}

/**
 * What a run does when it passes its token budget: `warn` finishes the work and reports the
 * overrun, `stop` withholds the remaining keys.
 */
export type BudgetBehavior = "warn" | "stop";

/** The token budget in force for a run, and how much of it was actually consumed. */
export interface RunBudget {
  /** The configured ceiling, in tokens. */
  readonly maxTokens: number;
  /** Whether passing the ceiling warns or stops the run. */
  readonly behavior: BudgetBehavior;
  /**
   * Whether the configured provider reports usage at all. When false the budget cannot be enforced,
   * because there is nothing to count.
   */
  readonly supported: boolean;
  /** Tokens consumed across the whole run so far. */
  readonly tokensUsed: number;
  /** True once `tokensUsed` passed `maxTokens`. */
  readonly exceeded: boolean;
}

/**
 * Why a {@link RunEstimate} does or does not carry a currency figure.
 *
 * - `priced`: a rate for this provider and model was found on the configured rate card and applied.
 * - `no-rate-on-file`: no rate was configured for {@link RunEstimate.rateKey}. The quantity is still
 *   reported; the money is not, because verbatra ships no prices of its own and will not guess one.
 * - `rate-unit-mismatch`: a rate exists but is written in the wrong unit for this provider, for
 *   instance a per-character price against a token-billed model. It is refused rather than applied.
 * - `not-billed`: the provider is a self-hosted endpoint, so no API bills for the run at all.
 */
export type EstimatePricing = "priced" | "no-rate-on-file" | "rate-unit-mismatch" | "not-billed";

/**
 * What a pre-run estimate deliberately leaves out. Each code marks a reason the real run can cost
 * less than the figure, or a reason the figure is approximate, so an estimate is never mistaken for
 * an invoice.
 *
 * - `CACHE_NOT_CONSULTED`: the estimate does not read the translation memory, so keys a live run
 *   would serve from cache are still counted.
 * - `SOURCE_DUPLICATES_NOT_DEDUPLICATED`: a live run sends one representative per identical source
 *   string; the estimate counts every key.
 * - `TOKEN_COUNT_IS_HEURISTIC`: tokens are derived from character counts, not from the provider's
 *   own tokenizer.
 * - `REPAIR_REQUESTS_NOT_COUNTED`: the one bounded extra request an incomplete response can
 *   trigger, whether keys were missing or the output was truncated, is not counted.
 */
export type EstimateCaveatCode =
  | "CACHE_NOT_CONSULTED"
  | "SOURCE_DUPLICATES_NOT_DEDUPLICATED"
  | "TOKEN_COUNT_IS_HEURISTIC"
  | "REPAIR_REQUESTS_NOT_COUNTED";

/**
 * The estimated billing quantity for one target locale, without the money. `inputTokens` and
 * `outputTokens` are present only for a token-billed provider, and `sourceCharacters` only for a
 * character-billed one, so a machine-translation API is never handed a token figure it does not
 * bill by.
 */
export interface LocaleEstimateQuantity {
  /** The target locale this estimate covers. */
  readonly locale: string;
  /** How many keys would be sent for this locale, translation and plural generation together. */
  readonly keys: number;
  /** How many provider requests those keys would be split into. */
  readonly requests: number;
  /** Estimated prompt tokens. Present only when the provider bills by tokens. */
  readonly inputTokens?: number;
  /** Estimated completion tokens. Present only when the provider bills by tokens. */
  readonly outputTokens?: number;
  /** Estimated source characters. Present only when the provider bills by characters. */
  readonly sourceCharacters?: number;
}

/** One locale of a {@link PricedRunEstimate}: the quantity plus the money it comes to. */
export interface PricedLocaleEstimate extends LocaleEstimateQuantity {
  /** The estimated cost for this locale, in {@link PricedRunEstimate.currency}. */
  readonly cost: number;
}

/** One locale of an {@link UnpricedRunEstimate}: the quantity, and deliberately no money. */
export interface UnpricedLocaleEstimate extends LocaleEstimateQuantity {
  /** Never present: the run carries no rate, so no locale of it carries a figure. */
  readonly cost?: undefined;
}

/**
 * One target locale of a {@link RunEstimate}. It carries a `cost` exactly when the run it belongs
 * to was priced, so there is no such thing as a priced estimate with a costless locale.
 */
export type LocaleEstimate = PricedLocaleEstimate | UnpricedLocaleEstimate;

/**
 * Everything a {@link RunEstimate} reports regardless of whether it could be priced: which provider
 * the figure was computed for, how much would be sent, and what the figure leaves out.
 */
export interface RunEstimateQuantity {
  /** The provider the estimate was computed for. */
  readonly provider: ProviderId;
  /** The configured model, absent for a provider that takes none (`deepl`, `google-translate`). */
  readonly model?: string;
  /**
   * The key a rate is filed under in the config's `rates.table`: `provider/model` for a provider
   * configured with a model, and the bare provider id otherwise.
   */
  readonly rateKey: string;
  /** Whether this provider charges by tokens or by source characters. */
  readonly unit: BillingUnit;
  /**
   * Keys that would be sent across every locale, counting both the keys that would be translated
   * and the plural forms that would be generated.
   */
  readonly keys: number;
  /** Provider requests across every locale, generation batches included. */
  readonly requests: number;
  /** Estimated prompt tokens across every locale. Present only for a token-billed provider. */
  readonly inputTokens?: number;
  /** Estimated completion tokens across every locale. Present only for a token-billed provider. */
  readonly outputTokens?: number;
  /** Estimated source characters across every locale. Present only for a character-billed provider. */
  readonly sourceCharacters?: number;
  /** What this figure leaves out. Always present, never empty. See {@link EstimateCaveatCode}. */
  readonly caveats: readonly EstimateCaveatCode[];
}

/**
 * An estimate a rate could be applied to: the config supplied a rate for {@link rateKey} in the
 * right unit, so the run carries a currency figure and the date that rate was read.
 */
export interface PricedRunEstimate extends RunEstimateQuantity {
  /** Always `priced`: a rate was found and applied. */
  readonly pricing: "priced";
  /** The rate card's currency code. */
  readonly currency: string;
  /**
   * The date the rates were read, as the config declared it. Print it beside any figure: a rate
   * card is exactly as current as this date.
   */
  readonly asOf: string;
  /** The per-locale breakdown, in the same order as {@link RunSummary.locales}. */
  readonly locales: readonly PricedLocaleEstimate[];
  /** The estimated total, in {@link currency}. */
  readonly cost: number;
}

/**
 * An estimate carrying quantity and no money, with {@link pricing} saying why. verbatra ships no
 * prices of its own and will not guess one, so the absence is reported rather than rendered as a
 * cost of zero.
 */
export interface UnpricedRunEstimate extends RunEstimateQuantity {
  /** Why no currency figure is present. See {@link EstimatePricing}. */
  readonly pricing: Exclude<EstimatePricing, "priced">;
  /** The per-locale breakdown, in the same order as {@link RunSummary.locales}. */
  readonly locales: readonly UnpricedLocaleEstimate[];
  /** Never present: there is no rate to express a figure in. */
  readonly currency?: undefined;
  /** Never present: there is no rate, so there is no date it was read on. */
  readonly asOf?: undefined;
  /** Never present: an absent rate is reported as absent, never as a cost of zero. */
  readonly cost?: undefined;
}

/**
 * A pre-run estimate: what a run would send, and what that would cost at the rates the project
 * supplied. It is computed without constructing a provider, reading an API key, or making a network
 * call.
 *
 * It is an upper bound on the work: every provider call a live run would make is counted, including
 * the plural-generation batches, and the prompt is measured from the request payload that would
 * actually be sent rather than modelled. The live run can only send less, because it consults the
 * translation memory and collapses identical source strings, neither of which the estimate does.
 * {@link EstimateCaveatCode} names each of those, and names the token count as a heuristic derived
 * from characters rather than from the provider's own tokenizer.
 *
 * Branch on {@link pricing}: a {@link PricedRunEstimate} carries `cost`, `currency` and `asOf`, and
 * an {@link UnpricedRunEstimate} carries none of them and says why.
 */
export type RunEstimate = PricedRunEstimate | UnpricedRunEstimate;

/** A condition the SDK reported on a locale. See {@link SdkNoticeCode}. */
export interface SdkNotice {
  /** The stable notice code. Branch on this, not on the message. */
  readonly code: SdkNoticeCode;
  /** A human-readable description of the condition. */
  readonly message: string;
}

/**
 * Any notice attached to a locale: either one the provider raised, such as a downgraded formality
 * or an ignored glossary, or one the SDK raised. Discriminate on `code`.
 */
export type LocaleNotice = ProviderNotice | SdkNotice;

/**
 * A translated key the provider layer flagged as worth a human look. The translation was still
 * written; these are advisory quality signals, not rejections.
 */
export interface NeedsReviewEntry {
  /** The key that was flagged. */
  readonly key: string;
  /** Why it was flagged. A key can carry more than one reason. */
  readonly reasons: readonly ReviewReasonCode[];
}

/** A row of an imported handoff that could not be read. Reported rather than aborting the import. */
export interface MalformedRowReport {
  /** The row's 1-based index within its sheet or file. */
  readonly row: number;
  /**
   * The 1-based physical line in the source file, for delimited formats where a quoted value can
   * span several lines. Absent for `.xlsx`, which has rows but no lines.
   */
  readonly line?: number;
  /** The column whose value was missing or unusable. */
  readonly column: string;
}

/**
 * A key that appeared more than once in an imported handoff. The first occurrence wins and the rest
 * are reported here, so a translator who duplicated a row learns which value was actually used.
 */
export interface DuplicateKeyReport {
  /** The key that appeared more than once. */
  readonly key: string;
  /** The 1-based row index of the ignored occurrence. */
  readonly row: number;
  /** The 1-based physical line of the ignored occurrence, for delimited formats. Absent for `.xlsx`. */
  readonly line?: number;
}

/**
 * Everything that happened for one locale during a run. The key lists are disjoint accounts of what
 * became of each key, so a caller can reconstruct the whole run without re-reading any file.
 *
 * A locale that failed outright still appears here with `status: "failed"` and an `error`, rather
 * than the whole run throwing. That is the central contract of {@link translate}: one unreachable
 * provider or one unwritable file does not discard the locales that succeeded.
 */
export interface LocaleSummary {
  /** The target locale this summary describes. */
  readonly locale: string;
  /**
   * `succeeded` when everything asked for was done, `partial` when some keys were translated and
   * others were not, and `failed` when the locale produced no usable result.
   */
  readonly status: "succeeded" | "partial" | "failed";
  /** Keys newly translated by the provider in this run. */
  readonly translated: readonly string[];
  /** Keys already up to date against the lock-file baseline, so no provider call was made. */
  readonly unchanged: readonly string[];
  /** Keys present in this locale but no longer in the source. Reported, and removed only when pruning. */
  readonly orphaned: readonly string[];
  /** Orphaned keys that were actually removed, which happens only when the run was asked to prune. */
  readonly pruned: readonly string[];
  /**
   * Keys whose source text is not valid ICU. They are skipped rather than sent to the provider,
   * because a broken source message cannot yield a sound translation.
   */
  readonly invalidIcuSource: readonly string[];
  /** Keys served from the translation memory instead of the provider, and so not paid for. */
  readonly cacheHits: readonly string[];
  /**
   * Keys whose translation was refused by the integrity gate, for instance because it dropped a
   * placeholder. The previous translation, if any, is left untouched.
   */
  readonly integrityMismatches: readonly string[];
  /** Keys the provider failed to translate, for instance because their sub-batch errored. */
  readonly providerFailures: readonly string[];
  /**
   * Keys whose plural categories were generated for the target language rather than translated one
   * by one. On a dry run, the forms a live run would generate: generation is a provider call of
   * its own, so a dry run reports it rather than reporting nothing.
   */
  readonly generated: readonly string[];
  /** Keys not translated because the token budget was exhausted under `stop` behavior. */
  readonly budgetWithheld: readonly string[];
  /** Token usage for this locale. Absent when the provider does not report usage. */
  readonly usage?: UsageSummary;
  /** Provider and SDK notices raised while running this locale. Always present, possibly empty. */
  readonly notices: readonly LocaleNotice[];
  /** Translated keys flagged as worth a human look. The translations were still written. */
  readonly needsReview: readonly NeedsReviewEntry[];
  /** Keys left with no translation after the run, whatever the cause. */
  readonly unfilled: readonly string[];
  /** Unreadable rows from an imported handoff. Always empty for a {@link translate} run. */
  readonly malformedRows: readonly MalformedRowReport[];
  /** Repeated keys from an imported handoff. Always empty for a {@link translate} run. */
  readonly duplicateKeys: readonly DuplicateKeyReport[];
  /**
   * Why this locale failed, when the failure came from a thrown error. The `code` is the failure's
   * own code where it has one, and `LOCALE_FAILED` otherwise. Never carries a secret.
   *
   * Absent unless `status` is `failed`, but a `failed` locale does not always carry it: a locale
   * whose every key was withheld by the integrity gate, a provider failure, or the token budget is
   * `failed` with nothing thrown, so this stays undefined and the withheld keys are the account of
   * what went wrong. Treat it as an optional detail on a failure, never as the failure test.
   */
  readonly error?: {
    /** The failure's own code where it had one, and `LOCALE_FAILED` otherwise. */
    readonly code: string;
    /** A human-readable description of the failure. Never contains a secret. */
    readonly message: string;
  };
}

/**
 * The result of a whole run, returned by {@link translate}, {@link watch}, and
 * {@link importWorkbook}.
 *
 * Per-locale outcomes are data, not exceptions: inspect `failed` and `partial` to decide an exit
 * code rather than relying on the call to throw. Only whole-run failures, such as an invalid config
 * or an unreadable source file, throw an {@link SdkError}.
 */
export interface RunSummary {
  /** True when the run computed everything but wrote nothing and called no provider. */
  readonly dryRun: boolean;
  /**
   * The full per-locale account. A {@link translate} or {@link watch} run reports them in
   * configured target order, whatever order a `locales` subset was given in and whatever order
   * concurrent locales finished in. An {@link importWorkbook} run does not: it reports them in the
   * order the handoff yielded them, then appends the configured locales the handoff had nothing
   * for. Match an entry on its `locale` rather than on its position.
   */
  readonly locales: readonly LocaleSummary[];
  /** Names of the locales whose status is `succeeded`. */
  readonly succeeded: readonly string[];
  /**
   * Names of the locales whose status is `partial`: written to disk, but with keys still missing.
   * Check this alongside `failed` before treating a run as clean. The CLI exits `1` on a partial
   * locale for that reason.
   */
  readonly partial: readonly string[];
  /** Names of the locales whose status is `failed`. Check this before treating a run as clean. */
  readonly failed: readonly string[];
  /** Token usage summed across every locale. Absent when the provider does not report usage. */
  readonly usage?: UsageSummary;
  /** The token budget in force, present only when the config set one. */
  readonly budget?: RunBudget;
  /**
   * What the run would have cost, present only when it was asked for a pre-run estimate. Always a
   * dry run: an estimate constructs no provider and spends nothing.
   */
  readonly estimate?: RunEstimate;
}
