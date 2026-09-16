import { describe, expect, it } from "vitest";
import { z } from "zod";
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

describe("rateCardSchema: a malformed rate must never become a plausible number", () => {
  function tokenTable(rate: unknown): unknown {
    return { ...validCard, table: { "anthropic/sonnet-test": rate } };
  }

  it("rejects an infinite token rate, which would otherwise render as an Infinity figure", () => {
    expect(() =>
      rateCardSchema.parse(
        tokenTable({ inputPerMillionTokens: Number.POSITIVE_INFINITY, outputPerMillionTokens: 15 }),
      ),
    ).toThrow();
  });

  it("rejects a negative-infinity rate", () => {
    expect(() =>
      rateCardSchema.parse(
        tokenTable({ inputPerMillionTokens: 3, outputPerMillionTokens: Number.NEGATIVE_INFINITY }),
      ),
    ).toThrow();
  });

  it("rejects a NaN rate, which would otherwise render as a NaN figure", () => {
    expect(() =>
      rateCardSchema.parse(
        tokenTable({ inputPerMillionTokens: Number.NaN, outputPerMillionTokens: 15 }),
      ),
    ).toThrow();
  });

  it("rejects a rate written as a numeric string", () => {
    expect(() =>
      rateCardSchema.parse(tokenTable({ inputPerMillionTokens: "3", outputPerMillionTokens: 15 })),
    ).toThrow();
  });

  it("accepts a zero rate, because a free tier is a real price and not a missing one", () => {
    const parsed = rateCardSchema.parse(
      tokenTable({ inputPerMillionTokens: 0, outputPerMillionTokens: 0 }),
    );

    expect(parsed.table["anthropic/sonnet-test"]).toEqual({
      inputPerMillionTokens: 0,
      outputPerMillionTokens: 0,
    });
  });

  it("accepts an empty table, which is a card that prices nothing rather than an invalid card", () => {
    const parsed = rateCardSchema.parse({ ...validCard, table: {} });

    expect(lookupRate(parsed, "deepl")).toBeUndefined();
  });

  it("rejects an empty rate key, so no rate can be filed under a key nothing resolves to", () => {
    expect(() =>
      rateCardSchema.parse({ ...validCard, table: { "": { perMillionCharacters: 25 } } }),
    ).toThrow();
  });
});

describe("lookupRate: inherited properties are not rates", () => {
  it("reports no rate for an Object.prototype member name", () => {
    const card = rateCardSchema.parse({ ...validCard, table: {} });

    expect(lookupRate(card, "constructor")).toBeUndefined();
    expect(lookupRate(card, "toString")).toBeUndefined();
  });
});

describe("rateCardSchema: asOf must be a date that exists", () => {
  it("is expressed in the shipped JSON Schema, so an editor can flag it too", () => {
    const document: unknown = z.toJSONSchema(rateCardSchema);
    const { properties } = document as { properties: Record<string, { format?: string }> };

    expect(properties.asOf?.format).toBe("date");
  });

  it("rejects a YYYY-MM-DD shaped string that is not a calendar date", () => {
    expect(() => rateCardSchema.parse({ ...validCard, asOf: "2026-99-99" })).toThrow();
  });

  it("rejects a day past the end of its month rather than rolling it into the next one", () => {
    expect(() => rateCardSchema.parse({ ...validCard, asOf: "2026-02-30" })).toThrow();
  });

  it("accepts a leap day in a leap year", () => {
    expect(rateCardSchema.parse({ ...validCard, asOf: "2024-02-29" }).asOf).toBe("2024-02-29");
  });

  it("rejects a leap day in a year that has none", () => {
    expect(() => rateCardSchema.parse({ ...validCard, asOf: "2026-02-29" })).toThrow();
  });
});

describe("rateCardSchema: a rate of absurd magnitude is refused at the boundary", () => {
  it("rejects a token rate large enough to overflow a figure to Infinity", () => {
    expect(() =>
      rateCardSchema.parse({
        ...validCard,
        table: {
          "anthropic/sonnet-test": {
            inputPerMillionTokens: Number.MAX_VALUE,
            outputPerMillionTokens: 15,
          },
        },
      }),
    ).toThrow();
  });

  it("rejects a character rate of absurd magnitude", () => {
    expect(() =>
      rateCardSchema.parse({
        ...validCard,
        table: { deepl: { perMillionCharacters: 1e300 } },
      }),
    ).toThrow();
  });

  it("still accepts a rate at the top of the plausible range", () => {
    const parsed = rateCardSchema.parse({
      ...validCard,
      table: { deepl: { perMillionCharacters: 1_000_000_000 } },
    });

    expect(lookupRate(parsed, "deepl")).toEqual({ perMillionCharacters: 1_000_000_000 });
  });
});

describe("rateCardSchema: the exact edge of the plausible range", () => {
  it("accepts the cap itself", () => {
    const parsed = rateCardSchema.parse({
      ...validCard,
      table: { deepl: { perMillionCharacters: 1_000_000_000 } },
    });

    expect(lookupRate(parsed, "deepl")).toEqual({ perMillionCharacters: 1_000_000_000 });
  });

  it("rejects the first value above the cap, not merely an absurd one", () => {
    expect(() =>
      rateCardSchema.parse({
        ...validCard,
        table: { deepl: { perMillionCharacters: 1_000_000_001 } },
      }),
    ).toThrow();
  });

  it("rejects a token rate one above the cap in either direction", () => {
    expect(() =>
      rateCardSchema.parse({
        ...validCard,
        table: {
          "anthropic/sonnet-test": {
            inputPerMillionTokens: 1_000_000_001,
            outputPerMillionTokens: 15,
          },
        },
      }),
    ).toThrow();
    expect(() =>
      rateCardSchema.parse({
        ...validCard,
        table: {
          "anthropic/sonnet-test": {
            inputPerMillionTokens: 3,
            outputPerMillionTokens: 1_000_000_001,
          },
        },
      }),
    ).toThrow();
  });

  it("lets a negative zero through but never lets it print as a negative figure", () => {
    const parsed = rateCardSchema.parse({
      ...validCard,
      table: { deepl: JSON.parse('{"perMillionCharacters":-0}') as unknown },
    });
    const rate = lookupRate(parsed, "deepl") as { readonly perMillionCharacters: number };
    const cost = (1_000_000 * rate.perMillionCharacters) / 1_000_000;

    expect(Object.is(cost, -0)).toBe(true);
    expect(cost.toFixed(4)).toBe("0.0000");
    expect(JSON.stringify({ cost })).toBe('{"cost":0}');
  });
});

describe("rateCardSchema: the currency label a figure is printed under", () => {
  it("rejects a lowercase code, so a figure is never labelled in a shape no ledger uses", () => {
    expect(() => rateCardSchema.parse({ ...validCard, currency: "usd" })).toThrow();
  });

  it("rejects a four-letter code", () => {
    expect(() => rateCardSchema.parse({ ...validCard, currency: "USDX" })).toThrow();
  });

  it("rejects an empty currency", () => {
    expect(() => rateCardSchema.parse({ ...validCard, currency: "" })).toThrow();
  });

  it("checks the shape of a currency code and not its existence, so a well-formed unreal code passes", () => {
    expect(rateCardSchema.parse({ ...validCard, currency: "ZZZ" }).currency).toBe("ZZZ");
  });
});
