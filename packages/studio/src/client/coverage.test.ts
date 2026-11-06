import { describe, expect, it } from "vitest";
import {
  averageCoverage,
  coveragePercent,
  type StatusRow,
  sortWorstFirst,
  toStatusData,
  toStatusOutcome,
} from "./coverage.js";
import type { RpcCallResult } from "./rpc-client.js";

function statusRow(overrides: Partial<StatusRow>): StatusRow {
  return {
    locale: "de",
    missing: 0,
    stale: 0,
    upToDate: 1,
    percent: 100,
    inSync: true,
    ...overrides,
  };
}

describe("averageCoverage", () => {
  it("is 100 for an empty row list, matching coveragePercent's zero-denominator convention", () => {
    expect(averageCoverage([])).toBe(100);
  });

  it("averages and rounds the per-locale percentages", () => {
    const rows = [
      statusRow({ locale: "de", percent: 100 }),
      statusRow({ locale: "fr", percent: 50 }),
      statusRow({ locale: "ar", percent: 34 }),
    ];
    expect(averageCoverage(rows)).toBe(61);
  });
});

describe("coveragePercent", () => {
  it("is 100 for a zero-key source project, never NaN or Infinity", () => {
    expect(coveragePercent({ missing: 0, stale: 0, upToDate: 0 })).toBe(100);
  });

  it("computes a rounded partial percentage", () => {
    expect(coveragePercent({ missing: 1, stale: 0, upToDate: 1 })).toBe(50);
  });

  it("rounds to the nearest whole percent", () => {
    expect(coveragePercent({ missing: 2, stale: 0, upToDate: 1 })).toBe(33);
  });

  it("is 100 when every key is up to date", () => {
    expect(coveragePercent({ missing: 0, stale: 0, upToDate: 4 })).toBe(100);
  });

  it("counts stale keys toward the denominator but not the numerator", () => {
    expect(coveragePercent({ missing: 0, stale: 1, upToDate: 1 })).toBe(50);
  });
});

describe("toStatusData", () => {
  it("maps a successful result to rows with a computed percentage per locale", () => {
    const result = {
      inSync: false,
      locales: [
        { locale: "de", missing: 1, stale: 0, upToDate: 1, inSync: false },
        { locale: "fr", missing: 0, stale: 0, upToDate: 0, inSync: true },
      ],
    };

    expect(toStatusData(result)).toEqual({
      inSync: false,
      rows: [
        { locale: "de", missing: 1, stale: 0, upToDate: 1, inSync: false, percent: 50 },
        { locale: "fr", missing: 0, stale: 0, upToDate: 0, inSync: true, percent: 100 },
      ],
    });
  });

  it("maps an in-sync, empty-locales result without crashing", () => {
    expect(toStatusData({ inSync: true, locales: [] })).toEqual({ inSync: true, rows: [] });
  });
});

describe("toStatusOutcome", () => {
  it("maps a domain error to a failing FetchOutcome, carrying the error through unchanged", () => {
    const response: RpcCallResult<"status.check"> = {
      ok: false,
      error: { code: "SOURCE_UNREADABLE", message: "The source locale file could not be read." },
    };

    expect(toStatusOutcome(response)).toEqual({
      ok: false,
      error: { code: "SOURCE_UNREADABLE", message: "The source locale file could not be read." },
    });
  });

  it("maps a successful result to a succeeding FetchOutcome carrying the derived StatusData", () => {
    const response: RpcCallResult<"status.check"> = {
      ok: true,
      result: {
        inSync: true,
        locales: [{ locale: "de", missing: 0, stale: 0, upToDate: 2, inSync: true }],
      },
    };

    expect(toStatusOutcome(response)).toEqual({
      ok: true,
      result: {
        inSync: true,
        rows: [{ locale: "de", missing: 0, stale: 0, upToDate: 2, inSync: true, percent: 100 }],
      },
    });
  });
});

describe("sortWorstFirst", () => {
  it("orders by lowest coverage, then most missing keys, then locale name", () => {
    const rows = [
      statusRow({ locale: "es", percent: 80, missing: 2 }),
      statusRow({ locale: "de", percent: 50, missing: 1 }),
      statusRow({ locale: "fr", percent: 50, missing: 5 }),
      statusRow({ locale: "ar", percent: 80, missing: 2 }),
    ];

    expect(sortWorstFirst(rows).map((row) => row.locale)).toEqual(["fr", "de", "ar", "es"]);
  });

  it("returns a new list and leaves its input untouched", () => {
    const rows = [statusRow({ locale: "b", percent: 90 }), statusRow({ locale: "a", percent: 10 })];

    const sorted = sortWorstFirst(rows);

    expect(sorted).not.toBe(rows);
    expect(rows.map((row) => row.locale)).toEqual(["b", "a"]);
  });
});
