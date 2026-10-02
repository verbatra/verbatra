import { describe, expect, it } from "vitest";
import { isShortInlineCode, SHORT_INLINE_CODE_MAX } from "@/lib/inline-code";

describe("isShortInlineCode", () => {
  it("keeps a short flag or command on one line", () => {
    expect(isShortInlineCode("diff --json")).toBe(true);
    expect(isShortInlineCode("x".repeat(SHORT_INLINE_CODE_MAX))).toBe(true);
  });

  it("lets a long snippet wrap", () => {
    expect(isShortInlineCode("x".repeat(SHORT_INLINE_CODE_MAX + 1))).toBe(false);
  });

  it("leaves highlighted block code alone", () => {
    expect(isShortInlineCode(["verbatra", " check"])).toBe(false);
  });
});
