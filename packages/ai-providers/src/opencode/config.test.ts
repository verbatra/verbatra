import { describe, expect, it } from "vitest";
import { openCodeConfigSchema } from "./config.js";

const valid = { model: "glm-5.3", maxOutputTokens: 4096 };

describe("openCodeConfigSchema", () => {
  it("accepts a model and an output token limit", () => {
    expect(openCodeConfigSchema.parse(valid)).toEqual(valid);
  });

  it("requires a non-empty model", () => {
    expect(openCodeConfigSchema.safeParse({ ...valid, model: "" }).success).toBe(false);
    expect(openCodeConfigSchema.safeParse({ maxOutputTokens: 4096 }).success).toBe(false);
  });

  it("requires a positive integer output token limit", () => {
    expect(openCodeConfigSchema.safeParse({ ...valid, maxOutputTokens: 0 }).success).toBe(false);
    expect(openCodeConfigSchema.safeParse({ model: "glm-5.3" }).success).toBe(false);
  });

  it("has no field for an API key or an endpoint", () => {
    expect(Object.keys(openCodeConfigSchema.shape)).not.toContain("apiKey");
    expect(Object.keys(openCodeConfigSchema.shape)).not.toContain("baseUrl");
    expect(openCodeConfigSchema.strict().safeParse({ ...valid, baseUrl: "http://x" }).success).toBe(
      false,
    );
  });

  it("accepts a timeout and a locale map", () => {
    expect(
      openCodeConfigSchema.safeParse({
        ...valid,
        requestTimeoutMs: 1000,
        localeMap: { de: "German" },
      }).success,
    ).toBe(true);
  });
});
