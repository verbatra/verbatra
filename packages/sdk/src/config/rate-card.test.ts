import { describe, expect, it } from "vitest";
import { lookupRate, rateCardSchema } from "./rate-card.js";

const validCard = {
  asOf: "2026-01-15",
  currency: "USD",
  table: {
    "anthropic/sonnet-test": { inputPerMillionTokens: 3, outputPerMillionTokens: 15 },
    deepl: { perMillionCharacters: 25 },
  },
};

describe("rateCardSchema", () => {
  it("accepts a dated card holding a token rate and a character rate", () => {
    expect(rateCardSchema.parse(validCard)).toEqual(validCard);
  });

  it("rejects a card whose asOf is not a calendar date, so staleness stays readable", () => {
    expect(() => rateCardSchema.parse({ ...validCard, asOf: "January 2026" })).toThrow();
  });

  it("rejects a currency that is not a three-letter code", () => {
    expect(() => rateCardSchema.parse({ ...validCard, currency: "dollars" })).toThrow();
  });

  it("rejects a negative rate", () => {
    expect(() =>
      rateCardSchema.parse({ ...validCard, table: { deepl: { perMillionCharacters: -1 } } }),
    ).toThrow();
  });

  it("rejects a rate that mixes the token and character shapes", () => {
    expect(() =>
      rateCardSchema.parse({
        ...validCard,
        table: {
          deepl: {
            perMillionCharacters: 25,
            inputPerMillionTokens: 3,
            outputPerMillionTokens: 15,
          },
        },
      }),
    ).toThrow();
  });

  it("rejects a token rate that names only one of the two directions", () => {
    expect(() =>
      rateCardSchema.parse({ ...validCard, table: { "openai/gpt": { inputPerMillionTokens: 3 } } }),
    ).toThrow();
  });
});

describe("lookupRate", () => {
  const card = rateCardSchema.parse(validCard);

  it("finds the rate filed under an exact rate key", () => {
    expect(lookupRate(card, "deepl")).toEqual({ perMillionCharacters: 25 });
  });

  it("reports no rate for a key the card does not carry", () => {
    expect(lookupRate(card, "openai/gpt-4.1-mini")).toBeUndefined();
  });

  it("reports no rate when no card was configured at all", () => {
    expect(lookupRate(undefined, "deepl")).toBeUndefined();
  });
});
