import { describe, expect, it } from "vitest";
import { deriveIntegrityPillView, type KeyIntegrityLocaleEntry } from "./integrity-pill.js";

function entry(overrides: Partial<KeyIntegrityLocaleEntry> = {}): KeyIntegrityLocaleEntry {
  return {
    locale: "de",
    hasPlaceholders: true,
    matches: true,
    missing: [],
    extra: [],
    icuValid: true,
    markupMatches: true,
    markupDetails: [],
    ...overrides,
  };
}

describe("deriveIntegrityPillView", () => {
  it("returns null when the locale carries no entry (not a changed key there)", () => {
    expect(deriveIntegrityPillView([], "de")).toBeNull();
    expect(deriveIntegrityPillView([entry({ locale: "fr" })], "de")).toBeNull();
  });

  it("renders success for a real match with placeholders present", () => {
    expect(deriveIntegrityPillView([entry()], "de")).toEqual({
      tone: "success",
      label: "Placeholders match",
      detail: null,
    });
  });

  it("renders neutral for a trivial match with no placeholders on either side", () => {
    expect(
      deriveIntegrityPillView([entry({ hasPlaceholders: false, matches: true })], "de"),
    ).toEqual({ tone: "neutral", label: "No placeholders", detail: null });
  });

  it("renders danger with a missing-token detail on a missing-placeholder mismatch", () => {
    expect(
      deriveIntegrityPillView([entry({ matches: false, missing: ["{{name}}"], extra: [] })], "de"),
    ).toEqual({
      tone: "danger",
      label: "Placeholder mismatch",
      detail: "missing {{name}}",
    });
  });

  it("renders danger with an extra-token detail on an extra-placeholder mismatch", () => {
    expect(
      deriveIntegrityPillView([entry({ matches: false, missing: [], extra: ["{{count}}"] })], "de"),
    ).toEqual({
      tone: "danger",
      label: "Placeholder mismatch",
      detail: "extra {{count}}",
    });
  });

  it("combines missing and extra tokens in the detail when both are present", () => {
    expect(
      deriveIntegrityPillView(
        [entry({ matches: false, missing: ["{{name}}"], extra: ["{{count}}"] })],
        "de",
      ),
    ).toEqual({
      tone: "danger",
      label: "Placeholder mismatch",
      detail: "missing {{name}}; extra {{count}}",
    });
  });

  it("renders danger, not neutral, when a placeholder-free source received an invented target placeholder", () => {
    expect(
      deriveIntegrityPillView(
        [entry({ hasPlaceholders: false, matches: false, missing: [], extra: ["{{name}}"] })],
        "de",
      ),
    ).toEqual({
      tone: "danger",
      label: "Placeholder mismatch",
      detail: "extra {{name}}",
    });
  });

  it("renders danger for invalid ICU message syntax when placeholders otherwise match", () => {
    expect(deriveIntegrityPillView([entry({ icuValid: false })], "de")).toEqual({
      tone: "danger",
      label: "Invalid message syntax",
      detail: null,
    });
  });

  it("renders danger, not neutral, when a placeholder-free source received an ICU-invalid target", () => {
    expect(
      deriveIntegrityPillView(
        [entry({ hasPlaceholders: false, matches: true, icuValid: false })],
        "de",
      ),
    ).toEqual({
      tone: "danger",
      label: "Invalid message syntax",
      detail: null,
    });
  });

  it("a placeholder mismatch still takes precedence over an ICU-invalid target", () => {
    expect(
      deriveIntegrityPillView(
        [entry({ matches: false, missing: ["{{name}}"], icuValid: false })],
        "de",
      ),
    ).toEqual({
      tone: "danger",
      label: "Placeholder mismatch",
      detail: "missing {{name}}",
    });
  });

  it("selects the entry matching the requested locale out of several", () => {
    const locales = [
      entry({ locale: "de", matches: false, missing: ["{{a}}"] }),
      entry({ locale: "fr" }),
    ];
    expect(deriveIntegrityPillView(locales, "fr")).toEqual({
      tone: "success",
      label: "Placeholders match",
      detail: null,
    });
  });
});

describe("deriveIntegrityPillView: inline markup already on disk", () => {
  it("renders danger with the tags behind the mismatch", () => {
    expect(
      deriveIntegrityPillView(
        [entry({ markupMatches: false, markupDetails: ["-</b>", "-<b>"] })],
        "de",
      ),
    ).toEqual({ tone: "danger", label: "Inline markup mismatch", detail: "-</b> -<b>" });
  });

  it("renders danger with no detail when no single tag is at fault", () => {
    expect(deriveIntegrityPillView([entry({ markupMatches: false })], "de")).toEqual({
      tone: "danger",
      label: "Inline markup mismatch",
      detail: null,
    });
  });

  it("keeps reporting a placeholder mismatch ahead of a markup one", () => {
    const view = deriveIntegrityPillView(
      [entry({ matches: false, missing: ["{{name}}"], markupMatches: false })],
      "de",
    );
    expect(view?.label).toBe("Placeholder mismatch");
  });
});
