import { describe, expect, it, vi } from "vitest";
import { baseConfig } from "../test-support.js";

vi.mock("./plural-rules.js", () => ({
  pluralCategoriesFor: (): readonly string[] => ["zero", "one", "other"],
}));

describe("previewIcuMessage: a plural category with no sample", () => {
  it("flags the preview as truncated instead of dropping the row silently", async () => {
    const { previewIcuMessage } = await import("./icu-preview.js");
    const result = previewIcuMessage({
      config: baseConfig({ format: "next-intl-json" }),
      locale: "en",
      value: "{n, plural, zero {z} one {o} other {x}}",
    });
    expect(result).toMatchObject({ valid: true, truncated: true });
    expect(result.supported && result.valid && result.rows.map((row) => row.category)).toEqual([
      "one",
      "other",
    ]);
  });
});
