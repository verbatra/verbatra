import { describe, expect, it } from "vitest";
import { subBatchFailedNotice } from "./batching.js";

describe("subBatchFailedNotice: wording", () => {
  it("counts one entry in the singular", () => {
    expect(subBatchFailedNotice(1, new Error("x")).message).toContain(
      "A sub-batch of 1 entry failed",
    );
  });

  it("counts several entries in the plural", () => {
    expect(subBatchFailedNotice(3, new Error("x")).message).toContain(
      "A sub-batch of 3 entries failed",
    );
  });
});
