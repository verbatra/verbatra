import { describe, expect, it } from "vitest";
import { similarityRatio } from "./similarity.js";

const DEFAULT_THRESHOLD = 0.9;

describe("similarityRatio: edits that change meaning are not scored lower for it", () => {
  it("scores a dropped negation above the default threshold once the sentence is long enough", () => {
    const score = similarityRatio(
      "Do not delete this file permanently from the server",
      "Do delete this file permanently from the server",
    );

    expect(score).toBeCloseTo(0.921569, 5);
    expect(score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
  });

  it("scores an inverted modal above the default threshold", () => {
    const score = similarityRatio(
      "This action cannot be undone once confirmed",
      "This action can be undone once confirmed",
    );

    expect(score).toBeCloseTo(0.930233, 5);
    expect(score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
  });

  it("keeps a dropped negation below the threshold only while the sentence stays short", () => {
    const score = similarityRatio("Do not delete this file", "Do delete this file");

    expect(score).toBeCloseTo(0.826087, 5);
    expect(score).toBeLessThan(DEFAULT_THRESHOLD);
  });

  it("scores a changed quantity above the default threshold inside a sentence", () => {
    const score = similarityRatio(
      "You have 5 items left in your shopping cart",
      "You have 6 items left in your shopping cart",
    );

    expect(score).toBeCloseTo(0.976744, 5);
    expect(score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
  });

  it("scores a changed unit above the default threshold", () => {
    const score = similarityRatio(
      "Your upload limit is 5 MB per file attachment",
      "Your upload limit is 5 GB per file attachment",
    );

    expect(score).toBeCloseTo(0.977778, 5);
    expect(score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
  });

  it("scores a changed proper noun above the default threshold", () => {
    const score = similarityRatio(
      "Sign in with your Google account to continue",
      "Sign in with your Apple account to continue",
    );

    expect(score).toBeCloseTo(0.909091, 5);
    expect(score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
  });

  it("scores a singular turned plural above the default threshold", () => {
    const score = similarityRatio(
      "Delete the selected file from this folder",
      "Delete the selected files from this folder",
    );

    expect(score).toBeCloseTo(0.97619, 5);
    expect(score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
  });

  it("scores a statement turned question above the default threshold", () => {
    const score = similarityRatio(
      "Are you sure you want to continue",
      "Are you sure you want to continue?",
    );

    expect(score).toBeCloseTo(0.970588, 5);
    expect(score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
  });

  it("scores a leading capital change above the default threshold, since nothing folds case", () => {
    const score = similarityRatio(
      "save changes before leaving the page",
      "Save changes before leaving the page",
    );

    expect(score).toBeCloseTo(0.972222, 5);
    expect(score).toBeGreaterThanOrEqual(DEFAULT_THRESHOLD);
  });

  it("scores a wholesale case change near the minimum, since every letter counts as an edit", () => {
    const score = similarityRatio("delete account", "DELETE ACCOUNT");

    expect(score).toBeCloseTo(0.071429, 5);
    expect(score).toBeLessThan(DEFAULT_THRESHOLD);
  });

  it("puts a single digit change out of reach of the highest threshold the schema allows", () => {
    const score = similarityRatio(`${"x".repeat(79)}5`, `${"x".repeat(79)}6`);

    expect(score).toBeCloseTo(0.9875, 4);
    expect(score).toBeGreaterThanOrEqual(0.98);
  });
});

describe("similarityRatio: threshold boundary", () => {
  it("lands exactly on the default threshold for one substitution in ten characters", () => {
    expect(similarityRatio("abcdefghij", "abcdefghiX")).toBe(DEFAULT_THRESHOLD);
  });

  it("falls just below the default threshold for one more edit", () => {
    const score = similarityRatio("abcdefghijklmnopqrs", "abcdefghijklmnopqXY");

    expect(score).toBeCloseTo(0.894737, 5);
    expect(score).toBeLessThan(DEFAULT_THRESHOLD);
  });

  it("scores an empty candidate against non-empty text at the minimum", () => {
    expect(similarityRatio("", "Save changes")).toBe(0);
  });

  it("measures in UTF-16 units, so swapping one flag emoji costs two edits and not one", () => {
    const german = "Great work \u{1f1e9}\u{1f1ea}";
    const french = "Great work \u{1f1eb}\u{1f1f7}";

    expect(german).toHaveLength(15);
    expect(similarityRatio(german, french)).toBeCloseTo(13 / 15, 5);
  });
});
