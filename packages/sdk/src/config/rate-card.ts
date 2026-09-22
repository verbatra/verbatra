import { z } from "zod";

const CURRENCY_CODE = /^[A-Z]{3}$/;

const MAX_RATE = 1_000_000_000;

const rateAmountSchema = z
  .number()
  .nonnegative()
  .max(MAX_RATE, {
    message:
      `a rate must be at most ${MAX_RATE} currency units per million, which is already far beyond ` +
      "any real price; a larger one is a typo or a unit mistake, not a rate",
  });

/**
 * The zod schema for one token-billed rate entry: an input and an output price per million
 * tokens, each at most `MAX_RATE` currency units.
 */
export const tokenRateSchema = z.strictObject({
  inputPerMillionTokens: rateAmountSchema,
  outputPerMillionTokens: rateAmountSchema,
});

/**
 * The zod schema for one character-billed rate entry (DeepL, Google Cloud Translation): a
 * price per million source characters.
 */
export const characterRateSchema = z.strictObject({
  perMillionCharacters: rateAmountSchema,
});

/**
 * The zod schema for one `rates.table` entry: either {@link tokenRateSchema} or
 * {@link characterRateSchema}, never a mix of the two shapes.
 */
export const modelRateSchema = z.union([tokenRateSchema, characterRateSchema]);

/**
 * The zod schema for the optional `rates` block: the `asOf` date and `currency` printed beside
 * every priced estimate, plus a `table` of {@link modelRateSchema} entries keyed by rate key
 * (`provider/model`, or the bare provider id for a provider without a model).
 */
export const rateCardSchema = z.strictObject({
  asOf: z.iso.date({
    error: "rates.asOf must be a date that exists on the calendar, written as YYYY-MM-DD",
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
 * example `gemini/gemini-2.5-flash`), and the bare provider id for one without (`deepl`,
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
