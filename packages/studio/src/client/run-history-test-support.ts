import type { RunHistoryCost, RunHistoryLocale, RunHistoryRecord } from "@verbatra/sdk";

export function localeEntry(
  locale: string,
  overrides: Partial<RunHistoryLocale> = {},
): RunHistoryLocale {
  return {
    locale,
    status: "succeeded",
    translated: 0,
    cacheHits: 0,
    fuzzyHits: 0,
    generated: 0,
    pruned: 0,
    integrityMismatches: 0,
    providerFailures: 0,
    ...overrides,
  };
}

export const PRICED: RunHistoryCost = {
  pricing: "priced",
  basis: "usage",
  rateKey: "anthropic/claude-sonnet-5-5",
  currency: "USD",
  asOf: "2026-01-01",
  amount: 0.5,
};

export function recordAt(at: string, overrides: Partial<RunHistoryRecord> = {}): RunHistoryRecord {
  return {
    version: 1,
    at,
    trigger: "translate",
    provider: "anthropic",
    model: "claude-sonnet-5-5",
    usage: { inputTokens: 100, outputTokens: 50 },
    cost: PRICED,
    locales: [localeEntry("de", { translated: 3 })],
    ...overrides,
  };
}
