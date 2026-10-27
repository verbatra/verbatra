import { ProviderError } from "@verbatra/ai-providers";
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

describe("subBatchFailedNotice: cause code", () => {
  it("carries the provider error code so a caller can look up its next step", () => {
    const notice = subBatchFailedNotice(2, new ProviderError("PROVIDER_ERROR", "failed"));
    expect(notice.causeCode).toBe("PROVIDER_ERROR");
    expect(notice.message).toContain("(PROVIDER_ERROR: failed)");
  });

  it("carries no cause code for a failure that is not a structured provider error", () => {
    const notice = subBatchFailedNotice(2, new Error("x"));
    expect(notice).not.toHaveProperty("causeCode");
    expect(notice.message).toContain("PROVIDER_CALL_FAILED");
  });
});
