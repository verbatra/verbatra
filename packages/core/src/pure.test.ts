import { describe, expect, it } from "vitest";
import * as barrel from "./index.js";
import * as pure from "./pure.js";

describe("the pure entry", () => {
  it("exposes exactly the zod-free runtime functions the playground needs", () => {
    expect(Object.keys(pure).sort()).toEqual([
      "checkPlaceholders",
      "contentHash",
      "diffResources",
      "isBlankValue",
      "normalizeText",
      "stableStringHash",
    ]);
  });

  it("re-exports the same functions the barrel exports", () => {
    expect({ ...pure }).toStrictEqual({
      checkPlaceholders: barrel.checkPlaceholders,
      contentHash: barrel.contentHash,
      diffResources: barrel.diffResources,
      isBlankValue: barrel.isBlankValue,
      normalizeText: barrel.normalizeText,
      stableStringHash: barrel.stableStringHash,
    });
  });
});
