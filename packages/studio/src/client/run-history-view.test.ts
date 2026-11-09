import type { RunHistoryCost } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { localeEntry, PRICED, recordAt } from "./run-history-test-support.js";
import {
  costSeries,
  describeCost,
  describeProvider,
  describeTokens,
  describeTrigger,
  formatCost,
  lastKnownCoverage,
  tokenSeries,
  toRunHistoryDisplay,
  toRunHistoryOutcome,
  totalLocales,
} from "./run-history-view.js";

describe("describeCost", () => {
  it("shows a priced token figure as an exact amount with its rate date", () => {
    const display = describeCost(PRICED);

    expect(display).toMatchObject({ kind: "priced", label: "$0.50", amount: 0.5, currency: "USD" });
    expect(display.hint).toContain("2026-01-01");
    expect(display.caveats).toEqual([]);
  });

  it("marks a source-characters figure as estimated and carries its caveats and the failure note", () => {
    const display = describeCost({
      ...PRICED,
      pricing: "priced",
      basis: "source-characters",
      caveats: ["SOURCE_DUPLICATES_NOT_DEDUPLICATED", "TRANSPORT_RETRIES_NOT_COUNTED"],
    } as RunHistoryCost);

    expect(display.kind).toBe("estimated");
    expect(display.label).toBe("estimated $0.50");
    expect(display.caveats).toEqual([
      "Repeated source strings are counted every time.",
      "Retried requests are not counted.",
      "Keys the provider failed on are not counted.",
    ]);
  });

  it("shows a USAGE_PARTIAL figure as a lower bound, never as exact", () => {
    const display = describeCost({ ...PRICED, caveats: ["USAGE_PARTIAL"] } as RunHistoryCost);

    expect(display.kind).toBe("lower-bound");
    expect(display.label).toBe("at least $0.50");
    expect(display.caveats).toEqual([
      "A locale sent keys and reported no tokens, so this is a lower bound.",
    ]);
  });

  it("falls back to the raw code for a caveat it has no sentence for", () => {
    const display = describeCost({
      ...PRICED,
      caveats: ["FUTURE_CAVEAT"],
    } as unknown as RunHistoryCost);

    expect(display.caveats).toEqual(["FUTURE_CAVEAT"]);
  });

  it("shows no rate, with the key it looked up, for a missing rate and for a unit mismatch", () => {
    const missing = describeCost({
      pricing: "no-rate-on-file",
      basis: "usage",
      rateKey: "openai/x",
    });
    const mismatch = describeCost({
      pricing: "rate-unit-mismatch",
      basis: "usage",
      rateKey: "openai/x",
    });

    expect(missing).toMatchObject({ kind: "no-rate", label: "no rate", amount: undefined });
    expect(missing.hint).toBe("No rate is on file for openai/x.");
    expect(mismatch).toMatchObject({ kind: "no-rate", label: "no rate" });
    expect(mismatch.hint).toContain("different unit");
  });

  it("shows unknown, never free, when keys were sent and the provider reported no tokens", () => {
    const display = describeCost({ pricing: "no-usage", basis: "usage", rateKey: "openai/x" });

    expect(display).toMatchObject({ kind: "unknown", label: "unknown", amount: undefined });
  });

  it("shows not billed for a record that has no basis at all", () => {
    const display = describeCost({ pricing: "not-billed", rateKey: "libretranslate" });

    expect(display).toMatchObject({ kind: "not-billed", label: "not billed", amount: undefined });
  });
});

describe("formatCost", () => {
  it("formats with Intl for the currency and keeps a tiny non-zero amount visible", () => {
    expect(formatCost(1234.5, "USD")).toBe("$1,234.50");
    expect(formatCost(0.0004, "USD")).toBe("$0.0004");
    expect(formatCost(0.00001, "USD")).toBe("under $0.0001");
    expect(formatCost(0, "USD")).toBe("$0.00");
    expect(formatCost(2, "EUR")).toBe("€2.00");
  });

  it("reuses one formatter per currency", () => {
    expect(formatCost(1, "GBP")).toBe(formatCost(1, "GBP"));
  });
});

describe("record descriptions", () => {
  it("names the trigger, with the entry count for a retranslation", () => {
    expect(describeTrigger(recordAt("2026-07-01T00:00:00.000Z"))).toBe("Translate");
    expect(describeTrigger(recordAt("2026-07-01T00:00:00.000Z", { trigger: "retranslate" }))).toBe(
      "Retranslate",
    );
    expect(
      describeTrigger(recordAt("2026-07-01T00:00:00.000Z", { trigger: "retranslate", entries: 1 })),
    ).toBe("Retranslate, 1 entry");
    expect(
      describeTrigger(
        recordAt("2026-07-01T00:00:00.000Z", { trigger: "retranslate", entries: 20 }),
      ),
    ).toBe("Retranslate, 20 entries");
  });

  it("names the provider, with the model when there is one", () => {
    expect(describeProvider(recordAt("2026-07-01T00:00:00.000Z"))).toBe(
      "anthropic / claude-sonnet-5-5",
    );
    expect(describeProvider(recordAt("2026-07-01T00:00:00.000Z", { model: undefined }))).toBe(
      "anthropic",
    );
  });

  it("reports tokens only when the record carries usage, never a fabricated zero", () => {
    expect(describeTokens(recordAt("2026-07-01T00:00:00.000Z"))).toEqual({
      reported: true,
      total: 150,
      input: 100,
      output: 50,
    });
    expect(describeTokens(recordAt("2026-07-01T00:00:00.000Z", { usage: undefined }))).toEqual({
      reported: false,
      total: undefined,
      input: undefined,
      output: undefined,
    });
  });

  it("sums every counter across the locales of a record", () => {
    const record = recordAt("2026-07-01T00:00:00.000Z", {
      locales: [
        localeEntry("de", {
          translated: 2,
          cacheHits: 1,
          fuzzyHits: 1,
          generated: 1,
          pruned: 1,
          integrityMismatches: 1,
          providerFailures: 1,
        }),
        localeEntry("fr", { translated: 3, providerFailures: 2 }),
      ],
    });

    expect(totalLocales(record)).toEqual({
      translated: 5,
      cacheHits: 1,
      fuzzyHits: 1,
      generated: 1,
      pruned: 1,
      integrityMismatches: 1,
      providerFailures: 3,
    });
  });
});

describe("lastKnownCoverage", () => {
  const measured = { missing: 1, stale: 2, upToDate: 3 };

  it("is empty for an empty history", () => {
    expect(lastKnownCoverage([])).toEqual([]);
  });

  it("takes the newest measured value per locale and marks a locale the latest run did not measure", () => {
    const latest = recordAt("2026-07-03T00:00:00.000Z", {
      locales: [localeEntry("de", { coverage: { missing: 0, stale: 0, upToDate: 9 } })],
    });
    const older = recordAt("2026-07-02T00:00:00.000Z", {
      locales: [
        localeEntry("de", { coverage: measured }),
        localeEntry("fr", { coverage: measured }),
        localeEntry("es"),
      ],
    });

    expect(lastKnownCoverage([latest, older])).toEqual([
      {
        locale: "de",
        missing: 0,
        stale: 0,
        upToDate: 9,
        measuredAt: "2026-07-03T00:00:00.000Z",
        measuredInLatestRun: true,
      },
      {
        locale: "fr",
        ...measured,
        measuredAt: "2026-07-02T00:00:00.000Z",
        measuredInLatestRun: false,
      },
    ]);
  });

  it("shows nothing for a record whose coverage was unavailable, and keeps the older value", () => {
    const latest = recordAt("2026-07-03T00:00:00.000Z", {
      coverageUnavailable: true,
      locales: [localeEntry("de")],
    });
    const older = recordAt("2026-07-02T00:00:00.000Z", {
      locales: [localeEntry("de", { coverage: measured })],
    });

    const rows = lastKnownCoverage([latest, older]);

    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ locale: "de", measuredInLatestRun: false });
  });

  it("sorts locales by name", () => {
    const record = recordAt("2026-07-03T00:00:00.000Z", {
      locales: [
        localeEntry("fr", { coverage: measured }),
        localeEntry("de", { coverage: measured }),
      ],
    });

    expect(lastKnownCoverage([record]).map((row) => row.locale)).toEqual(["de", "fr"]);
  });
});

describe("series", () => {
  it("runs oldest to newest, in the currency of the newest priced run", () => {
    const newest = recordAt("2026-07-03T00:00:00.000Z", {
      cost: { ...PRICED, currency: "EUR", amount: 3 } as RunHistoryCost,
    });
    const middle = recordAt("2026-07-02T00:00:00.000Z", {
      cost: { pricing: "no-rate-on-file", basis: "usage", rateKey: "x" },
    });
    const oldest = recordAt("2026-07-01T00:00:00.000Z", {
      cost: { ...PRICED, currency: "USD", amount: 1 } as RunHistoryCost,
    });

    const series = costSeries([newest, middle, oldest]);

    expect(series.currency).toBe("EUR");
    expect(series.otherCurrencies).toBe(1);
    expect(series.points).toEqual([
      { value: undefined, hollow: false },
      { value: undefined, hollow: false },
      { value: 3, hollow: false },
    ]);
  });

  it("draws an estimate and a lower bound hollow", () => {
    const estimate = recordAt("2026-07-02T00:00:00.000Z", {
      cost: { ...PRICED, basis: "source-characters" } as RunHistoryCost,
    });
    const partial = recordAt("2026-07-01T00:00:00.000Z", {
      cost: { ...PRICED, caveats: ["USAGE_PARTIAL"] } as RunHistoryCost,
    });

    expect(costSeries([estimate, partial]).points.map((point) => point.hollow)).toEqual([
      true,
      true,
    ]);
  });

  it("has no currency when no run was priced", () => {
    const series = costSeries([
      recordAt("2026-07-01T00:00:00.000Z", { cost: { pricing: "not-billed", rateKey: "x" } }),
    ]);

    expect(series.currency).toBeUndefined();
    expect(series.points).toEqual([{ value: undefined, hollow: false }]);
  });

  it("leaves a gap for a run that reported no tokens", () => {
    const withTokens = recordAt("2026-07-02T00:00:00.000Z");
    const without = recordAt("2026-07-01T00:00:00.000Z", { usage: undefined });

    expect(tokenSeries([withTokens, without])).toEqual([
      { value: undefined, hollow: false },
      { value: 150, hollow: false },
    ]);
  });
});

describe("toRunHistoryDisplay", () => {
  it("is empty, with no notice, for a history nothing was ever recorded in", () => {
    expect(toRunHistoryDisplay({ records: [], total: 0, unreadableRecords: 0 })).toEqual({
      records: [],
      notices: [],
      empty: true,
    });
  });

  it("reports a corrupt file as its unreadable count while the readable records still show", () => {
    const record = recordAt("2026-07-01T00:00:00.000Z");

    const display = toRunHistoryDisplay({ records: [record], total: 1, unreadableRecords: 2 });

    expect(display.empty).toBe(false);
    expect(display.notices).toEqual([{ kind: "unreadable-records", count: 2 }]);
  });

  it("reports an unavailable file, and says when only the newest records are shown", () => {
    const record = recordAt("2026-07-01T00:00:00.000Z");

    expect(
      toRunHistoryDisplay({ records: [], total: 0, unreadableRecords: 0, unavailable: "too-large" })
        .notices,
    ).toEqual([{ kind: "unavailable", reason: "too-large" }]);
    expect(
      toRunHistoryDisplay({ records: [record], total: 40, unreadableRecords: 0 }).notices,
    ).toEqual([{ kind: "truncated", shown: 1, total: 40 }]);
  });
});

describe("toRunHistoryOutcome", () => {
  it("passes a result and an error through", () => {
    const result = { records: [], total: 0, unreadableRecords: 0 };

    expect(toRunHistoryOutcome({ ok: true, result })).toEqual({ ok: true, result });
    expect(toRunHistoryOutcome({ ok: false, error: { code: "X", message: "m" } })).toEqual({
      ok: false,
      error: { code: "X", message: "m" },
    });
  });
});
