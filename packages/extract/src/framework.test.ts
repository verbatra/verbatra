import { describe, expect, it } from "vitest";
import { SOURCE_FRAMEWORKS, sourceFrameworkSchema } from "./framework.js";

describe("sourceFrameworkSchema", () => {
  it("accepts every member of the closed union", () => {
    for (const framework of SOURCE_FRAMEWORKS) {
      expect(sourceFrameworkSchema.parse(framework)).toBe(framework);
    }
  });

  it("rejects a framework that is not shipped", () => {
    expect(sourceFrameworkSchema.safeParse("vue-i18n").success).toBe(false);
  });
});
