import { describe, expect, it } from "vitest";
import { SCAFFOLD_MODELS } from "./scaffold.js";

describe("SCAFFOLD_MODELS", () => {
  it("pins one cosmetic default model per LLM provider", () => {
    expect(SCAFFOLD_MODELS).toEqual({
      anthropic: "claude-sonnet-4-6",
      openai: "gpt-5.4-mini",
      gemini: "gemini-2.5-flash",
      opencode: "glm-5.3",
    });
  });

  it("omits DeepL, which has no model", () => {
    expect(Object.keys(SCAFFOLD_MODELS).sort()).toEqual([
      "anthropic",
      "gemini",
      "openai",
      "opencode",
    ]);
    expect(SCAFFOLD_MODELS).not.toHaveProperty("deepl");
  });
});
