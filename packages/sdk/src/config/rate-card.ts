import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;

export const tokenRateSchema = z.strictObject({
  inputPerMillionTokens: z.number().nonnegative(),
  outputPerMillionTokens: z.number().nonnegative(),
});

export const characterRateSchema = z.strictObject({
  perMillionCharacters: z.number().nonnegative(),
});

export const modelRateSchema = z.union([tokenRateSchema, characterRateSchema]);

export const rateCardSchema = z.strictObject({
  asOf: z.string().regex(ISO_DATE, {
    message: "rates.asOf must be a calendar date written as YYYY-MM-DD",
  }),
  currency: z.string().regex(CURRENCY_CODE, {
    message: "rates.currency must be a three-letter uppercase code such as USD or EUR",
  }),
  table: z.record(z.string().min(1), modelRateSchema),
});

/**
 * A rate charging by tokens, with the prompt and the completion priced separately. Every hosted LLM
 * provider bills this way.
 */
export type TokenRate = z.infer<typeof tokenRateSchema>;

/** A rate charging by source characters, which is how the machine-translation APIs bill. */
export type CharacterRate = z.infer<typeof characterRateSchema>;

/** One entry of a {@link RateCard}: either a token rate or a character rate, never both. */
export type ModelRate = z.infer<typeof modelRateSchema>;

/**
 * The rates a project supplies so an estimate can be expressed in money. verbatra ships no prices of
 * its own: they are a third party's, they change without notice, and a number baked into a release
 * would quietly go stale. The card carries the date it was read and the currency it is written in,
 * so any figure derived from it is visibly as old as `asOf` says it is.
 *
 * `table` is keyed by rate key: `provider/model` for a provider configured with a model (for
 * example `anthropic/claude-sonnet-4-5`), and the bare provider id for one without (`deepl`,
 * `google-translate`).
 */
export type RateCard = z.infer<typeof rateCardSchema>;

export function lookupRate(card: RateCard | undefined, rateKey: string): ModelRate | undefined {
  if (card === undefined) {
    return undefined;
  }
  return Object.hasOwn(card.table, rateKey) ? card.table[rateKey] : undefined;
}

export function isTokenRate(rate: ModelRate): rate is TokenRate {
  return "inputPerMillionTokens" in rate;
}
