import type { LocaleCheckSummary, LocaleDiff } from "@verbatra/sdk";
import { describe, expect, it } from "vitest";
import { renderCheckHuman, renderDiffHuman } from "./render.js";
import { makeCheckSummary, makeDiffSummary } from "./test-support.js";

function checkLocale(locale: string, emptySource?: number): LocaleCheckSummary {
  return {
    locale,
    missing: 0,
    stale: 0,
    upToDate: 1,
    inSync: true,
    ...(emptySource !== undefined ? { emptySource } : {}),
  };
}

function diffLocale(overrides: Partial<LocaleDiff>): LocaleDiff {
  return {
    locale: "de",
    missing: [],
    changed: [],
    orphaned: [],
    hasPendingChanges: false,
    ...overrides,
  };
}

describe("render: source keys with an empty value", () => {
  it("names the largest per-locale count once under check", () => {
    const text = renderCheckHuman(
      makeCheckSummary({ inSync: true, locales: [checkLocale("de", 2), checkLocale("fr", 1)] }),
    );

    expect(text).toContain(
      "2 source keys have an empty value and are not counted: write their source text to translate them",
    );
  });

  it("uses the singular for one key", () => {
    const text = renderCheckHuman(
      makeCheckSummary({ inSync: true, locales: [checkLocale("de", 1)] }),
    );

    expect(text).toContain(
      "1 source key has an empty value and is not counted: write its source text to translate it",
    );
  });

  it("prints no line when no key is empty or the count is absent", () => {
    const text = renderCheckHuman(
      makeCheckSummary({ inSync: true, locales: [checkLocale("de", 0), checkLocale("fr")] }),
    );

    expect(text).not.toContain("empty value");
  });

  it("lists the keys under a locale with no pending changes in diff", () => {
    const text = renderDiffHuman(
      makeDiffSummary({
        hasPendingChanges: false,
        locales: [diffLocale({ emptySource: ["missing.in.source"] })],
      }),
    );

    expect(text).toContain("  de: no pending changes\n    empty source: missing.in.source");
  });

  it("lists the keys after the pending groups in diff", () => {
    const text = renderDiffHuman(
      makeDiffSummary({
        hasPendingChanges: true,
        locales: [diffLocale({ missing: ["a"], hasPendingChanges: true, emptySource: ["b"] })],
      }),
    );

    expect(text).toContain("    add:          a\n    empty source: b");
  });

  it("prints no empty-source group when the list is empty or absent", () => {
    const text = renderDiffHuman(
      makeDiffSummary({
        hasPendingChanges: false,
        locales: [diffLocale({ emptySource: [] }), diffLocale({ locale: "fr" })],
      }),
    );

    expect(text).not.toContain("empty source");
  });
});
