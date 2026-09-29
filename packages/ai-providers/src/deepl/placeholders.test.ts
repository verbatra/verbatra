import { describe, expect, it } from "vitest";
import { PLACEHOLDER_UNSUPPORTED_MESSAGE } from "./placeholders.js";

describe("PLACEHOLDER_UNSUPPORTED_MESSAGE", () => {
  it("exposes a static, secret-free message that names no key or content", () => {
    expect(PLACEHOLDER_UNSUPPORTED_MESSAGE).toContain("DeepL");
    expect(PLACEHOLDER_UNSUPPORTED_MESSAGE).toContain("LLM provider");
    expect(PLACEHOLDER_UNSUPPORTED_MESSAGE).not.toContain("{{");
    expect(PLACEHOLDER_UNSUPPORTED_MESSAGE).not.toContain("sk-");
  });
});
