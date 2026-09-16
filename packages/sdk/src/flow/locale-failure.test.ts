import { describe, expect, it } from "vitest";
import { deriveLocaleStatus, failureSummary, partition } from "./locale-failure.js";
import type { FuzzyCacheHit, LocaleSummary } from "./summary.js";

function summaryWith(locale: string, status: LocaleSummary["status"]): LocaleSummary {
  return {
    locale,
    status,
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
  };
}

const NO_STATUS_PARTS = {
  translated: [] as readonly string[],
  cacheHits: [] as readonly string[],
  fuzzyHits: [] as readonly FuzzyCacheHit[],
  generated: [] as readonly string[],
  integrityMismatches: [] as readonly string[],
  providerFailures: [] as readonly string[],
  budgetWithheld: [] as readonly string[],
};

describe("failureSummary", () => {
  it("returns a failed summary with empty lists and the structured error", () => {
    const error = Object.assign(new Error("nope"), { code: "ADAPTER_WRITE" });
    expect(failureSummary("de", error)).toEqual({
      locale: "de",
      status: "failed",
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
      error: { code: "ADAPTER_WRITE", message: "nope" },
    });
  });
});

describe("deriveLocaleStatus", () => {
  it("is succeeded when nothing was withheld and something was accepted", () => {
    expect(deriveLocaleStatus({ ...NO_STATUS_PARTS, translated: ["a", "b"] })).toBe("succeeded");
  });

  it("is succeeded for a genuine no-op: no candidate keys, nothing accepted, nothing withheld", () => {
    expect(deriveLocaleStatus(NO_STATUS_PARTS)).toBe("succeeded");
  });

  it("is partial when at least one key was accepted and at least one was withheld", () => {
    expect(
      deriveLocaleStatus({ ...NO_STATUS_PARTS, translated: ["a"], providerFailures: ["b"] }),
    ).toBe("partial");
    expect(
      deriveLocaleStatus({ ...NO_STATUS_PARTS, translated: ["a"], integrityMismatches: ["b"] }),
    ).toBe("partial");
    expect(
      deriveLocaleStatus({ ...NO_STATUS_PARTS, translated: ["a"], budgetWithheld: ["b"] }),
    ).toBe("partial");
  });

  it("is partial when only cache hits were accepted (translated empty) and something was withheld", () => {
    expect(
      deriveLocaleStatus({ ...NO_STATUS_PARTS, cacheHits: ["a"], providerFailures: ["b"] }),
    ).toBe("partial");
  });

  it("is succeeded when only cache hits were accepted and nothing was withheld", () => {
    expect(deriveLocaleStatus({ ...NO_STATUS_PARTS, cacheHits: ["a", "b"] })).toBe("succeeded");
  });

  it("is partial when only generated plural forms were accepted (translated empty) and something was withheld", () => {
    expect(
      deriveLocaleStatus({
        ...NO_STATUS_PARTS,
        generated: ["items_two"],
        budgetWithheld: ["items_few"],
      }),
    ).toBe("partial");
  });

  it("is failed when candidate keys were withheld and none were accepted", () => {
    expect(deriveLocaleStatus({ ...NO_STATUS_PARTS, providerFailures: ["a", "b"] })).toBe("failed");
    expect(deriveLocaleStatus({ ...NO_STATUS_PARTS, integrityMismatches: ["a"] })).toBe("failed");
    expect(deriveLocaleStatus({ ...NO_STATUS_PARTS, budgetWithheld: ["a"] })).toBe("failed");
  });
});

describe("partition", () => {
  it("splits a mixed list into the succeeded, partial, and failed locale-name lists", () => {
    const summaries: readonly LocaleSummary[] = [
      summaryWith("de", "succeeded"),
      summaryWith("fr", "partial"),
      failureSummary("it", "raw"),
      summaryWith("es", "succeeded"),
      summaryWith("pt", "partial"),
    ];
    expect(partition(summaries)).toEqual({
      succeeded: ["de", "es"],
      partial: ["fr", "pt"],
      failed: ["it"],
    });
  });

  it("never reports a partial or failed locale as succeeded", () => {
    const summaries: readonly LocaleSummary[] = [
      summaryWith("fr", "partial"),
      summaryWith("it", "failed"),
    ];
    expect(partition(summaries).succeeded).toEqual([]);
  });

  it("returns empty lists for an empty input", () => {
    expect(partition([])).toEqual({ succeeded: [], partial: [], failed: [] });
  });
});
