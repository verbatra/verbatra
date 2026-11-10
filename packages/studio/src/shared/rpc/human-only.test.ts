import { describe, expect, it } from "vitest";
import { HUMAN_ONLY_METHOD_NAMES } from "./human-only.js";
import { APPLY_VALUE_REPLACE_METHOD, PREVIEW_VALUE_REPLACE_METHOD } from "./value-replace.js";

describe("HUMAN_ONLY_METHOD_NAMES", () => {
  it("holds both value replace methods, so no agent tool is registered for them", () => {
    expect(HUMAN_ONLY_METHOD_NAMES).toContain(PREVIEW_VALUE_REPLACE_METHOD);
    expect(HUMAN_ONLY_METHOD_NAMES).toContain(APPLY_VALUE_REPLACE_METHOD);
  });
});
