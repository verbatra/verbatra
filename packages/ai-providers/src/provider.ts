import type { PlaceholderIntegrityResult, PluralCategory, TranslationEntry } from "@verbatra/core";
import { PLURAL_CATEGORIES, translationEntrySchema } from "@verbatra/core";
import { z } from "zod";
import { ProviderError } from "./errors.js";
import { type LocaleGlossary, localeGlossarySchema } from "./glossary.js";
import type { LocaleNormalizer } from "./locale-map.js";
import type { ProviderNetwork } from "./network/transport.js";

/**
 * A provider is either a prompt-driven LLM (`llm`) or a dedicated machine-translation API
 * (`machine-translation`). The distinction is descriptive, not dispatch: both kinds satisfy the same
 * {@link TranslationProvider} contract, and callers use it to set expectations (an LLM accepts free-form
 * context and a glossary term map, an MT API generally does not).
 */
export type ProviderKind = "llm" | "machine-translation";

/**
 * Target tone for a translation. `formal` and `informal` request the corresponding register, and
 * `neutral` requests neither. Machine-translation providers map it to their formality setting and may
 * report a `FORMALITY_DOWNGRADED` {@link ProviderNotice} when they cannot apply it.
 */
export type Tone = "formal" | "informal" | "neutral";

/**
 * Produces the placeholder set of a value for the output integrity check. Supplied
 * by the caller (the SDK) so it matches the entries' format; ai-providers never
 * derives placeholders itself.
 */
export type PlaceholderExtractor = (value: string) => readonly string[];

/**
 * Compares a source and translated value directly instead of independently extracting each side's flat
 * placeholder list first, which lets it express checks the flat lists cannot (branch-aware ICU
 * comparison, or a one-directional rule). Supplied by the caller (the SDK, for a format whose adapter
 * defines one) so it matches the entries' format; ai-providers never derives it itself and never parses
 * a specific format's message syntax.
 */
export type PlaceholderComparator = (
  source: string,
  translated: string,
) => PlaceholderIntegrityResult;

/**
 * The CLDR plural categories of a batch's target language, one list per rule type, each in CLDR
 * order and each containing `other`.
 */
export interface PluralCategories {
  /** The categories an ICU `plural` must carry in the target language. */
  readonly cardinal: readonly PluralCategory[];
  /** The categories an ICU `selectordinal` must carry in the target language. */
  readonly ordinal: readonly PluralCategory[];
}

/**
 * A batch translation request. Format- and provider-neutral: it carries no prompt,
 * model, key, or other provider-specific field. The placeholder extractor is
 * mandatory and is checked before the data fields are parsed.
 */
export interface TranslateRequest {
  /** BCP-47 source locale of the entries (for example, "en"). */
  readonly sourceLocale: string;
  /** BCP-47 target locale to translate into (for example, "de"). */
  readonly targetLocale: string;
  /** The entries to translate; at least one is required. */
  readonly entries: readonly TranslationEntry[];
  /**
   * Optional glossary for this batch's target locale only: required translations, forbidden
   * renderings, and terms to keep untranslated. An LLM provider sends it to the model as data; a
   * machine-translation provider cannot apply it and reports `GLOSSARY_IGNORED` when it holds a
   * required translation or a term to keep. Every provider checks its output against it for review.
   */
  readonly glossary?: LocaleGlossary;
  /** Optional target {@link Tone}; machine-translation providers map it to formality. */
  readonly tone?: Tone;
  /**
   * Optional per-key maximum length budget, measured in grapheme clusters. A key present in the map
   * whose translation comes back longer than its budget is flagged `MAX_LENGTH_EXCEEDED`; a key
   * absent from the map is never flagged. Advisory only: it never changes what is sent to the
   * provider and never withholds a value.
   */
  readonly maxLength?: ReadonlyMap<string, number>;
  /**
   * Optional CLDR plural categories of the target language, set by the SDK for a batch in an ICU
   * format that holds a `plural` or `selectordinal` value. An LLM provider sends them to the model
   * as data, asking for exactly these arms instead of the source's; a machine-translation provider
   * ignores them, since it never translates a value that carries ICU syntax. Validated as CLDR
   * keywords only.
   */
  readonly pluralCategories?: PluralCategories;
  /** Mandatory placeholder extractor; the output integrity check runs against it. */
  readonly extractPlaceholders: PlaceholderExtractor;
  /**
   * Optional whole-value placeholder comparator. When present, the output integrity check uses it
   * instead of independently extracting each side's placeholders with {@link extractPlaceholders} and
   * diffing the flat lists. Supplied for a format whose adapter defines one, whether because the
   * comparison is branch-aware or because it adds a check the flat lists cannot express. Absent
   * otherwise.
   */
  readonly comparePlaceholders?: PlaceholderComparator;
  /**
   * Optional cancellation signal for this batch. When aborted, an in-flight provider call rejects
   * with the abort, unwrapped, instead of a `ProviderError`. Not a plain-data field: it is
   * never validated alongside the data fields and never sent to a provider.
   */
  readonly signal?: AbortSignal;
  /**
   * Optional listener called with the number of keys an LLM provider re-requests in its bounded
   * repair round, just before that request, when the first response left keys out. Never called by
   * a machine-translation provider. Not a plain-data field: it is never validated or sent.
   */
  readonly onRepair?: (keys: number) => void;
}

/**
 * Token usage, when the provider reports it. Absent for the providers that do not bill by token
 * (DeepL and Google Cloud Translation).
 */
export interface Usage {
  /** Tokens consumed by the request, summed across the initial call and any repair round. */
  readonly inputTokens: number;
  /** Tokens produced by the response, summed across the initial call and any repair round. */
  readonly outputTokens: number;
}

/**
 * Stable codes for a provider's graceful-degradation notices. These are returned DATA on a
 * successful result, NOT thrown:
 *
 * - `FORMALITY_DOWNGRADED`: a requested `formal` or `informal` tone was not applied (DeepL's free
 *   tier does not support formality, and Google Cloud Translation Basic has no formality control).
 * - `GLOSSARY_IGNORED`: a supplied glossary with a required translation or a term to keep
 *   untranslated was not applied (DeepL only applies a native glossary id, never verbatra's glossary,
 *   and Google Cloud Translation Basic supports no glossary). A glossary that only lists forbidden
 *   renderings does not raise it, since those are checked after translation rather than applied.
 * - `PLACEHOLDER_UNSUPPORTED`: at least one placeholder- or ICU-bearing entry was left untranslated
 *   because the provider cannot preserve those tokens; such entries are withheld (absent from the
 *   result maps) rather than sent to the provider and mangled.
 */
export type ProviderNoticeCode =
  | "FORMALITY_DOWNGRADED"
  | "GLOSSARY_IGNORED"
  | "PLACEHOLDER_UNSUPPORTED";

/**
 * An observable, structured signal that something was gracefully degraded (not an
 * error). Carries only a stable code and a static message, never a key or content.
 * Surfaced as result data, never thrown; callers inspect it but need not treat it as a failure.
 */
export interface ProviderNotice {
  /** The stable {@link ProviderNoticeCode} for what was degraded. */
  readonly code: ProviderNoticeCode;
  /** A static, safe description; never a key or translatable content. */
  readonly message: string;
}

/**
 * Stable codes for a derived, per-key "needs review" signal. This is verbatra's own computed
 * assessment, never a raw model self-score: five are recomputable from plain source and translated
 * values, and `FUZZY_CACHE_REUSE` and `PROVIDER_DEGRADED` are layered on afterwards, the first by
 * the SDK from where the value came, the second from the batch's notices.
 *
 * - `LENGTH_RATIO_OUTLIER`: the translated value's length is far shorter or longer than the source's.
 *   Both trimmed values are measured in grapheme clusters, each weighted by its own script so the
 *   length is Latin-equivalent: a Han character counts 3.5, a Hiragana or Katakana character 1.5, a
 *   Hangul syllable 2, and anything else 1. A correct translation between scripts, including
 *   mixed text with placeholders or URLs, is therefore not flagged for its script alone. Only
 *   considered once the trimmed source is long enough for the ratio to mean anything. Relative to
 *   the source; contrast `MAX_LENGTH_EXCEEDED`.
 * - `MAX_LENGTH_EXCEEDED`: the translated value is longer than the absolute budget configured for
 *   its key. Measured in grapheme clusters (user-perceived characters), on the value exactly as
 *   written with no trimming, and the comparison is inclusive, so a value of exactly the budget is
 *   not flagged. A key with no configured budget is never flagged. Advisory only: an over-budget
 *   value is still written to the locale file and still recorded in the lock file, because a
 *   correct translation that overruns a layout budget is more useful than no translation at all.
 * - `EQUALS_SOURCE`: the translated value equals the source value once both are trimmed, so a
 *   difference in leading or trailing whitespace alone still counts as equal. Also requires that
 *   the locales differ and that the value contains at least one letter (so a bare symbol or number
 *   is not flagged). A source made only of do-not-translate terms, or of glossary terms whose
 *   translation is the term itself, is not flagged either, since copying it is the correct result.
 * - `GLOSSARY_TERM_MISSED`: a glossary term of the target locale appeared in the source but its
 *   translation for that locale did not appear in the translated value, or a do-not-translate term
 *   appeared in the source but not in the translated value, compared with case unless the term is
 *   not case-sensitive. Each locale is
 *   checked against its own translations, so a German translation is never held to a French term.
 *   Matching ignores case unless the term is marked case-sensitive, and folds case by the rules of
 *   each side's locale. The two sides are held to deliberately different standards. The source
 *   side requires a whole-word occurrence, so the term "AI" is not found inside "Airport" and cannot
 *   raise an expectation the translator was never given; a source term whose edge character belongs
 *   to a script written without word separators (Han, kana, Thai and similar) has no boundary to
 *   anchor to and falls back to containment. The target side requires containment only, because a
 *   translated term legitimately fuses with the text around it: German compounds ("Benutzerkonto"),
 *   Korean particles ("계정을") and Japanese loanwords all carry the term with no boundary around
 *   it, and demanding one there would flag correct translations in most languages a glossary is
 *   used for.
 * - `GLOSSARY_FORBIDDEN_TERM`: the translated value uses a rendering the glossary forbids for the
 *   target locale. It is matched as a whole word on the translated side, with the same fallback to
 *   containment for scripts without word separators, so an inflected or compounded form is only
 *   caught when it is listed too. A rendering the source itself contains is not flagged, since the
 *   translation may legitimately quote it.
 * - `INTEGRITY_REORDERED`: the placeholder set matched but landed in a different order.
 * - `PROVIDER_DEGRADED`: the batch this key came from carried a `FORMALITY_DOWNGRADED` or
 *   `GLOSSARY_IGNORED` notice, either of which can silently change wording. A
 *   `PLACEHOLDER_UNSUPPORTED` notice does not raise it, since the affected entries are withheld
 *   rather than degraded.
 * - `FUZZY_CACHE_REUSE`: the value was not translated for this source text at all. It was reused
 *   from the translation memory for an earlier, near-identical source that has since been edited,
 *   so it is a translation of text that is no longer the source text. Similarity is measured in
 *   characters and meaning is not a function of character distance: a dropped negation, an
 *   inverted modal or a swapped proper noun are all small edits with large consequences, and no
 *   threshold separates them from a typo fix. Every such reuse therefore carries this reason, on
 *   every run, regardless of score.
 *
 * This tuple is the single source of truth for the set. {@link ReviewReasonCode} is derived from
 * it, so build any runtime validator or exhaustive lookup from this value rather than retyping the
 * members; a hand-copied list silently falls behind the next addition.
 *
 * @example
 * ```ts
 * import { REVIEW_REASON_CODES } from "@verbatra/sdk";
 * import { z } from "zod";
 *
 * const reasonSchema = z.enum(REVIEW_REASON_CODES);
 * ```
 */
export const REVIEW_REASON_CODES = [
  "LENGTH_RATIO_OUTLIER",
  "MAX_LENGTH_EXCEEDED",
  "EQUALS_SOURCE",
  "GLOSSARY_TERM_MISSED",
  "GLOSSARY_FORBIDDEN_TERM",
  "INTEGRITY_REORDERED",
  "PROVIDER_DEGRADED",
  "FUZZY_CACHE_REUSE",
] as const;

/**
 * One of {@link REVIEW_REASON_CODES}. The union is derived from that tuple rather than written out
 * again, so a code can only be added in one place and every consumer that builds a runtime schema
 * or an exhaustive map from the tuple stays in step automatically.
 */
export type ReviewReasonCode = (typeof REVIEW_REASON_CODES)[number];

/** A key flagged for human review, carrying every reason code that applies. */
export interface ReviewFlag {
  /** Always "review": the flag exists only for flagged keys, so there is no "ok" member. */
  readonly status: "review";
  /** Every {@link ReviewReasonCode} that applies to this key; never empty. */
  readonly reasons: readonly ReviewReasonCode[];
}

/** Result of a batch translation: per-key values, per-key integrity outcomes, and any notices. */
export interface TranslateResult {
  /**
   * The translated value for each requested key. A key can be absent when the provider withheld it
   * (see `PLACEHOLDER_UNSUPPORTED`) or never returned it, so callers must not assume one entry in
   * equals one entry out.
   */
  readonly values: ReadonlyMap<string, string>;
  /** The placeholder-integrity outcome for each key (source vs translated placeholder sets). */
  readonly integrity: ReadonlyMap<string, PlaceholderIntegrityResult>;
  /** Token usage when the provider reports it; absent for token-less providers. */
  readonly usage?: Usage;
  /**
   * Graceful-degradation notices for this batch. Every provider populates this as a present array:
   * DeepL and Google Cloud Translation report real notices (for example `GLOSSARY_IGNORED`); an LLM
   * provider with nothing to report returns an empty array rather than omitting the field.
   */
  readonly notices?: readonly ProviderNotice[];
  /**
   * Derived per-key review flags for this batch. A key absent from the map is implicitly "ok"; a
   * present key carries one or more {@link ReviewReasonCode}s. Optional and additive.
   */
  readonly reviewFlags?: ReadonlyMap<string, ReviewFlag>;
}

/**
 * The single contract every provider implements. It is narrow enough that a machine-translation API like
 * DeepL fits it directly, while LLM providers implement it by delegating to the shared
 * `runLlmTranslation` layer. To use your own implementation, return it from the `createProvider`
 * dependency that `translate`, `watch` and `retranslateEntry` accept.
 *
 * Implementer invariants:
 * - Translatable strings are UNTRUSTED. They travel only as data to the provider; never splice them into
 *   instruction text, and never act on instructions a value appears to contain.
 * - Read the API key ONLY from the environment (inside the SDK client). The request, config, and this
 *   interface never carry a key.
 * - Fail with a secret-free `ProviderError`: never bind, log, or re-throw raw SDK error text (it can
 *   carry a key or request headers). Validate the request at the boundary so the integrity check can
 *   never be skipped.
 */
export interface TranslationProvider {
  /** A stable identifier for this provider (for example, "anthropic", "deepl"). */
  readonly id: string;
  /** Whether this provider is a prompt-driven LLM or a dedicated machine-translation API. */
  readonly kind: ProviderKind;
  /** Whether this provider applies a configured glossary. */
  readonly supportsGlossary: boolean;
  /**
   * Translate a batch of entries.
   *
   * @param request - The provider-neutral batch request (no prompt, model, or key).
   * @returns The per-key translated values and per-key placeholder-integrity outcomes.
   * @throws `ProviderError`, secret-free, with the code for the failure (the concrete codes are
   *   the implementation's; see each provider factory). An aborted {@link TranslateRequest.signal}
   *   instead rejects with the abort itself, unwrapped.
   */
  translateBatch(request: TranslateRequest): Promise<TranslateResult>;
}

export interface ProviderLanguage {
  readonly code: string;
  readonly source: boolean;
  readonly target: boolean;
  readonly glossary: boolean;
  readonly formality: boolean;
}

export type ProviderLanguageTableOrigin = "static" | "live";

export interface ProviderLanguageTable {
  readonly version: string;
  readonly origin: ProviderLanguageTableOrigin;
  readonly documentation: readonly string[];
  readonly languages: readonly ProviderLanguage[];
}

export interface LiveLanguageRequest {
  readonly network?: ProviderNetwork;
}

interface LanguageCodeMapping {
  readonly toSourceCode: LocaleNormalizer;
  readonly toTargetCode: LocaleNormalizer;
}

export interface ListedLanguageSupport extends LanguageCodeMapping {
  readonly coverage: "listed";
  readonly table: ProviderLanguageTable;
  readonly fetchLive?: (request: LiveLanguageRequest) => Promise<ProviderLanguageTable>;
}

export interface OpenLanguageSupport extends LanguageCodeMapping {
  readonly coverage: "open";
  readonly version: string;
  readonly wellTestedLanguages: readonly string[];
}

export type ProviderLanguageSupport = ListedLanguageSupport | OpenLanguageSupport;

const requestDataSchema = z.object({
  sourceLocale: z.string().min(1),
  targetLocale: z.string().min(1),
  entries: z.array(translationEntrySchema).min(1),
  glossary: localeGlossarySchema.optional(),
  tone: z.enum(["formal", "informal", "neutral"]).optional(),
  maxLength: z.map(z.string().min(1), z.number().int().nonnegative()).optional(),
  pluralCategories: z
    .object({
      cardinal: z.array(z.enum(PLURAL_CATEGORIES)).min(1),
      ordinal: z.array(z.enum(PLURAL_CATEGORIES)).min(1),
    })
    .optional(),
});

export type ValidatedRequestData = z.infer<typeof requestDataSchema>;

export function validateRequest(request: TranslateRequest): ValidatedRequestData {
  if (typeof request.extractPlaceholders !== "function") {
    throw new ProviderError("INVALID_REQUEST", "A placeholder extractor function is required.");
  }
  const parsed = requestDataSchema.safeParse(request);
  if (!parsed.success) {
    throw new ProviderError("INVALID_REQUEST", "The translation request is malformed.");
  }
  return parsed.data;
}
