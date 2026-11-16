import { createAnthropicProvider, ProviderError } from "@verbatra/ai-providers";
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

const ONE_ENTRY = {
  sourceLocale: "en",
  targetLocale: "de",
  entries: [{ key: "k", namespace: "", value: "Hello", placeholders: [], isPlural: false }],
  extractPlaceholders: () => [],
} as const;

async function providerFailureWithStatus(status: number): Promise<unknown> {
  const failing = {
    messages: {
      create: (): Promise<never> => Promise.reject(Object.assign(new Error("vendor"), { status })),
    },
  };
  const provider = createAnthropicProvider(
    { model: "m", maxTokens: 64 },
    { client: failing as never },
  );
  return provider.translateBatch(ONE_ENTRY).catch((caught: unknown) => caught);
}

describe("subBatchFailedNotice: retry advice by HTTP status", () => {
  it.each([400, 404, 422])("says a retry will not help after a %i", async (status) => {
    const notice = subBatchFailedNotice(1, await providerFailureWithStatus(status));
    expect(notice.message).toMatch(
      /and was withheld; running again will fail the same way until the cause is fixed\.$/,
    );
  });

  it.each([408, 429, 500, 503])("promises a retry after a %i", async (status) => {
    const notice = subBatchFailedNotice(1, await providerFailureWithStatus(status));
    expect(notice.message).toMatch(/and was withheld; it will be retried next run\.$/);
  });
});
