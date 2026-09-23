import { describe, expect, it } from "vitest";
import { type DiffLocale, deriveKeyLocaleStatus, driftKeys, isFullyInSync } from "./diff-view.js";

function locale(overrides: Partial<DiffLocale> & { readonly locale: string }): DiffLocale {
  return {
    missing: [],
    changed: [],
    orphaned: [],
    hasPendingChanges: false,
    ...overrides,
  };
}

describe("deriveKeyLocaleStatus", () => {
  it("reports missing when the key is in that locale's missing list", () => {
    const rows = deriveKeyLocaleStatus(
      [locale({ locale: "de", missing: ["greeting"] })],
      "greeting",
    );

    expect(rows).toEqual([{ locale: "de", status: "missing" }]);
  });

  it("reports changed when the key is in that locale's changed list", () => {
    const rows = deriveKeyLocaleStatus(
      [locale({ locale: "de", changed: ["greeting"] })],
      "greeting",
    );

    expect(rows).toEqual([{ locale: "de", status: "changed" }]);
  });

  it("reports orphaned when the key is in that locale's orphaned list", () => {
    const rows = deriveKeyLocaleStatus(
      [locale({ locale: "de", orphaned: ["greeting"] })],
      "greeting",
    );

    expect(rows).toEqual([{ locale: "de", status: "orphaned" }]);
  });

  it("reports protected ahead of changed when a run would leave the key for a person", () => {
    const rows = deriveKeyLocaleStatus(
      [locale({ locale: "de", changed: ["greeting"], protected: ["greeting"] })],
      "greeting",
    );

    expect(rows).toEqual([{ locale: "de", status: "protected" }]);
  });

  it("reports in-sync when the key is in none of the three lists", () => {
    const rows = deriveKeyLocaleStatus([locale({ locale: "de" })], "greeting");

    expect(rows).toEqual([{ locale: "de", status: "in-sync" }]);
  });

  it("prioritizes missing over changed and orphaned when a key oddly appears in more than one list", () => {
    const rows = deriveKeyLocaleStatus(
      [
        locale({
          locale: "de",
          missing: ["greeting"],
          changed: ["greeting"],
          orphaned: ["greeting"],
        }),
      ],
      "greeting",
    );

    expect(rows).toEqual([{ locale: "de", status: "missing" }]);
  });

  it("prioritizes changed over orphaned", () => {
    const rows = deriveKeyLocaleStatus(
      [locale({ locale: "de", changed: ["greeting"], orphaned: ["greeting"] })],
      "greeting",
    );

    expect(rows).toEqual([{ locale: "de", status: "changed" }]);
  });

  it("derives one row per locale, independently, preserving order", () => {
    const rows = deriveKeyLocaleStatus(
      [
        locale({ locale: "de", missing: ["greeting"] }),
        locale({ locale: "fr", changed: ["greeting"] }),
        locale({ locale: "es" }),
      ],
      "greeting",
    );

    expect(rows).toEqual([
      { locale: "de", status: "missing" },
      { locale: "fr", status: "changed" },
      { locale: "es", status: "in-sync" },
    ]);
  });

  it("returns an empty list for no locales", () => {
    expect(deriveKeyLocaleStatus([], "greeting")).toEqual([]);
  });
});

describe("isFullyInSync", () => {
  it("is true for an empty locales list", () => {
    expect(isFullyInSync([])).toBe(true);
  });

  it("is true when every locale has empty missing, changed, and orphaned lists", () => {
    expect(isFullyInSync([locale({ locale: "de" }), locale({ locale: "fr" })])).toBe(true);
  });

  it("is false when a locale has a missing key", () => {
    expect(isFullyInSync([locale({ locale: "de", missing: ["greeting"] })])).toBe(false);
  });

  it("is false when a locale has a changed key", () => {
    expect(isFullyInSync([locale({ locale: "de", changed: ["greeting"] })])).toBe(false);
  });

  it("is false when a locale has only an orphaned key, even though hasPendingChanges would be false", () => {
    expect(
      isFullyInSync([locale({ locale: "de", orphaned: ["greeting"], hasPendingChanges: false })]),
    ).toBe(false);
  });
});

describe("driftKeys", () => {
  it("returns an empty list for no locales", () => {
    expect(driftKeys([])).toEqual([]);
  });

  it("returns an empty list when no locale has any drift", () => {
    expect(driftKeys([locale({ locale: "de" }), locale({ locale: "fr" })])).toEqual([]);
  });

  it("unions missing, changed, and orphaned keys across locales", () => {
    const keys = driftKeys([
      locale({ locale: "de", missing: ["a"], changed: ["b"] }),
      locale({ locale: "fr", orphaned: ["c"] }),
    ]);

    expect(keys).toEqual(["a", "b", "c"]);
  });

  it("deduplicates a key that drifts in more than one locale or list", () => {
    const keys = driftKeys([
      locale({ locale: "de", missing: ["greeting"] }),
      locale({ locale: "fr", changed: ["greeting"] }),
    ]);

    expect(keys).toEqual(["greeting"]);
  });

  it("returns keys sorted alphabetically regardless of input order", () => {
    const keys = driftKeys([locale({ locale: "de", missing: ["zebra", "apple", "mango"] })]);

    expect(keys).toEqual(["apple", "mango", "zebra"]);
  });
});
