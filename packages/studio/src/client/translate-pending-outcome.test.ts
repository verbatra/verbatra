import type { LocaleSummary } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import type { RpcCallResult } from "./rpc-client.js";
import { deriveTranslatePendingOutcome } from "./translate-pending-outcome.js";

function locale(overrides: Partial<LocaleSummary> & { readonly locale: string }): LocaleSummary {
  return {
    status: "succeeded",
    translated: [],
    unchanged: [],
    orphaned: [],
    pruned: [],
    invalidIcuSource: [],
    cacheHits: [],
    fuzzyHits: [],
    integrityMismatches: [],
    providerFailures: [],
    budgetWithheld: [],
    generated: [],
    notices: [],
    needsReview: [],
    unfilled: [],
    malformedRows: [],
    duplicateKeys: [],
    ...overrides,
  };
}

function ok(
  overrides: Partial<{
    locales: readonly LocaleSummary[];
    succeeded: readonly string[];
    partial: readonly string[];
    failed: readonly string[];
  }> = {},
) {
  return {
    ok: true as const,
    result: {
      dryRun: false,
      locales: overrides.locales ?? [],
      succeeded: overrides.succeeded ?? ["de", "fr"],
      partial: overrides.partial ?? [],
      failed: overrides.failed ?? [],
    },
  };
}

describe("deriveTranslatePendingOutcome", () => {
  it("maps every-locale-succeeded to success", () => {
    const response = ok({ succeeded: ["de", "fr"], failed: [] });
    expect(deriveTranslatePendingOutcome(response)).toEqual({ kind: "success" });
  });

  it("maps a genuine no-op run (all lists empty) to success", () => {
    const response = ok({ succeeded: [], partial: [], failed: [], locales: [] });
    expect(deriveTranslatePendingOutcome(response)).toEqual({ kind: "success" });
  });

  it("maps a RunSummary carrying one or more failed locales to partial-failure, naming them", () => {
    const response = ok({ succeeded: ["de"], failed: ["fr", "es"] });
    expect(deriveTranslatePendingOutcome(response)).toEqual({
      kind: "partial-failure",
      failedLocales: ["fr", "es"],
    });
  });

  it("maps a run with no failed locales but a partial locale carrying withheld keys to withheld", () => {
    const response = ok({
      succeeded: ["de"],
      partial: ["fr"],
      failed: [],
      locales: [
        locale({ locale: "de", status: "succeeded", translated: ["a"] }),
        locale({
          locale: "fr",
          status: "partial",
          translated: ["a"],
          integrityMismatches: ["b", "c"],
          providerFailures: ["d"],
          budgetWithheld: ["e", "f", "g"],
        }),
      ],
    });
    expect(deriveTranslatePendingOutcome(response)).toEqual({
      kind: "withheld",
      withheldCount: 6,
      partialLocales: ["fr"],
      breakdown: { integrityMismatches: 2, providerFailures: 1, budgetWithheld: 3 },
    });
  });

  it("sums the withheld breakdown across every partial locale", () => {
    const response = ok({
      succeeded: [],
      partial: ["fr", "es"],
      failed: [],
      locales: [
        locale({
          locale: "fr",
          status: "partial",
          translated: ["a"],
          integrityMismatches: ["b"],
        }),
        locale({
          locale: "es",
          status: "partial",
          translated: ["a"],
          providerFailures: ["c", "d"],
          budgetWithheld: ["e"],
        }),
      ],
    });
    expect(deriveTranslatePendingOutcome(response)).toEqual({
      kind: "withheld",
      withheldCount: 4,
      partialLocales: ["fr", "es"],
      breakdown: { integrityMismatches: 1, providerFailures: 2, budgetWithheld: 1 },
    });
  });

  it("prefers partial-failure over withheld when both failed and partial locales exist", () => {
    const response = ok({
      succeeded: [],
      partial: ["fr"],
      failed: ["es"],
      locales: [
        locale({
          locale: "fr",
          status: "partial",
          translated: ["a"],
          integrityMismatches: ["b"],
        }),
        locale({ locale: "es", status: "failed", providerFailures: ["c"] }),
      ],
    });
    expect(deriveTranslatePendingOutcome(response)).toEqual({
      kind: "partial-failure",
      failedLocales: ["es"],
    });
  });

  it("maps a transport/domain RPC error to the error kind, carrying its message", () => {
    const response: RpcCallResult<"translation.translatePending"> = {
      ok: false,
      error: { code: "METHOD_RATE_LIMITED", message: "Too many calls to this method." },
    };
    expect(deriveTranslatePendingOutcome(response)).toEqual({
      kind: "error",
      message: "Too many calls to this method.",
    });
  });

  it("maps ALREADY_IN_PROGRESS to the error kind, not a distinct fifth kind", () => {
    const response: RpcCallResult<"translation.translatePending"> = {
      ok: false,
      error: { code: "ALREADY_IN_PROGRESS", message: "A matching call is already in progress." },
    };
    expect(deriveTranslatePendingOutcome(response)).toEqual({
      kind: "error",
      message: "A matching call is already in progress.",
    });
  });
});
