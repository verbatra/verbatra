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

const NO_RETRY =
  /and was withheld; running again will fail the same way until the cause is fixed\.$/;
const RETRY = /and was withheld; it will be retried next run\.$/;

describe("subBatchFailedNotice: retry advice by HTTP status", () => {
  it.each([400, 404, 422])("says a retry will not help after a %i", (status) => {
    const notice = subBatchFailedNotice(1, new ProviderError("PROVIDER_ERROR", "x", { status }));
    expect(notice.message).toMatch(NO_RETRY);
  });

  it.each([
    ["TIMEOUT", 408],
    ["RATE_LIMITED", 429],
    ["PROVIDER_UNAVAILABLE", 503],
    ["PROVIDER_ERROR", 500],
  ] as const)("promises a retry after %s with HTTP %i", (code, status) => {
    const notice = subBatchFailedNotice(1, new ProviderError(code, "x", { status }));
    expect(notice.message).toMatch(RETRY);
  });
});

describe("subBatchFailedNotice: retry advice by cause", () => {
  it("says a retry will not help after AUTH_FAILED", () => {
    const notice = subBatchFailedNotice(1, new ProviderError("AUTH_FAILED", "rejected"));
    expect(notice.message).toMatch(NO_RETRY);
    expect(notice.causeCode).toBe("AUTH_FAILED");
  });

  it("promises a retry after a failure that is not a ProviderError", () => {
    const notice = subBatchFailedNotice(1, new Error("socket hang up"));
    expect(notice.message).toMatch(RETRY);
    expect(notice.message).toContain("PROVIDER_CALL_FAILED");
  });
});
