import { PROVIDER_ERROR_CODES, type ProviderErrorCode } from "@verbatra/ai-providers";
import { describe, expect, expectTypeOf, it } from "vitest";
import { localeSummarySchema, runSummarySchema } from "./summary-schema.js";

function localeWithCause(causeCode: string) {
  return {
    locale: "de",
    status: "partial",
    translated: [],
    unchanged: [],
    orphaned: [],
    pruned: [],
    invalidIcuSource: [],
    cacheHits: [],
    fuzzyHits: [],
    integrityMismatches: [],
    providerFailures: ["greeting"],
    generated: [],
    budgetWithheld: [],
    sensitiveWithheld: [],
    notices: [{ code: "SUB_BATCH_FAILED", message: "A sub-batch failed.", causeCode }],
    needsReview: [],
    unfilled: [],
    protected: [],
    malformedRows: [],
    duplicateKeys: [],
  };
}

function runWithCause(causeCode: string) {
  return {
    dryRun: false,
    locales: [localeWithCause(causeCode)],
    succeeded: [],
    partial: ["de"],
    failed: [],
  };
}

describe("SUB_BATCH_FAILED causeCode", () => {
  it("lists exactly the members of ProviderErrorCode", () => {
    expectTypeOf<(typeof PROVIDER_ERROR_CODES)[number]>().toEqualTypeOf<ProviderErrorCode>();
    expect(new Set(PROVIDER_ERROR_CODES).size).toBe(PROVIDER_ERROR_CODES.length);
    expect(PROVIDER_ERROR_CODES).toHaveLength(12);
  });

  it.each(PROVIDER_ERROR_CODES)("accepts %s in a locale summary and a run summary", (code) => {
    expect(localeSummarySchema.safeParse(localeWithCause(code)).success).toBe(true);
    expect(runSummarySchema.safeParse(runWithCause(code)).success).toBe(true);
  });

  it("rejects a code that is not a provider error code", () => {
    expect(localeSummarySchema.safeParse(localeWithCause("BOGUS")).success).toBe(false);
    expect(runSummarySchema.safeParse(runWithCause("BOGUS")).success).toBe(false);
  });
});
