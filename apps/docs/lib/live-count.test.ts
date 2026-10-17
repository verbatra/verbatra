import { describe, expect, it } from "vitest";
import { fillCount, LIVE_COUNT_SLOT } from "@/lib/live-count";

describe("fillCount", () => {
  it("puts the count into the slot of a translated template", () => {
    expect(fillCount(`${LIVE_COUNT_SLOT} stars on GitHub`, "1.2K")).toBe("1.2K stars on GitHub");
  });
});
