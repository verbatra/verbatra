import { describe, expect, it } from "vitest";
import { isTranslationOutdated } from "./translation-freshness";

const times = { "cli/translate.mdx": 200, "cli/translate.de.mdx": 100, "cli/diff.mdx": 100 };

describe("isTranslationOutdated", () => {
  it("flags a translation last committed before its English page", () => {
    expect(isTranslationOutdated(times, "cli/translate.mdx", "cli/translate.de.mdx")).toBe(true);
  });

  it("does not flag a translation committed together with or after the English page", () => {
    expect(isTranslationOutdated({ "a.mdx": 100, "a.de.mdx": 100 }, "a.mdx", "a.de.mdx")).toBe(
      false,
    );
    expect(isTranslationOutdated({ "a.mdx": 100, "a.de.mdx": 150 }, "a.mdx", "a.de.mdx")).toBe(
      false,
    );
  });

  it("stays quiet when either time is unknown", () => {
    expect(isTranslationOutdated(times, "cli/diff.mdx", "cli/diff.de.mdx")).toBe(false);
    expect(isTranslationOutdated({}, "cli/translate.mdx", "cli/translate.de.mdx")).toBe(false);
  });
});
