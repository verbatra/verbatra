import { describe, expect, it } from "vitest";
import { billingFor, modelOf, PROVIDER_BILLING, rateKeyFor } from "./provider-billing.js";
import { PROVIDER_IDS } from "./provider-config.js";

describe("PROVIDER_BILLING", () => {
  it("addresses every provider id, so a new provider cannot ship without a billing decision", () => {
    expect(Object.keys(PROVIDER_BILLING).sort()).toEqual([...PROVIDER_IDS].sort());
  });

  it("bills the two machine-translation providers by source characters", () => {
    expect(billingFor("deepl")).toEqual({ unit: "characters", billedByApi: true });
    expect(billingFor("google-translate")).toEqual({ unit: "characters", billedByApi: true });
  });

  it("bills the three hosted LLM providers by tokens", () => {
    expect(billingFor("anthropic")).toEqual({ unit: "tokens", billedByApi: true });
    expect(billingFor("openai")).toEqual({ unit: "tokens", billedByApi: true });
    expect(billingFor("gemini")).toEqual({ unit: "tokens", billedByApi: true });
  });

  it("counts tokens for a self-hosted endpoint but records that no API bills them", () => {
    expect(billingFor("openai-compatible")).toEqual({ unit: "tokens", billedByApi: false });
  });
});

describe("modelOf", () => {
  it("reads the model a token-billed provider was configured with", () => {
    expect(modelOf({ id: "anthropic", options: { model: "sonnet-test", maxTokens: 4096 } })).toBe(
      "sonnet-test",
    );
  });

  it("reports no model for a provider whose config has no model field", () => {
    expect(modelOf({ id: "deepl", options: {} })).toBeUndefined();
    expect(modelOf({ id: "google-translate", options: {} })).toBeUndefined();
  });
});

describe("rateKeyFor", () => {
  it("qualifies a model-bearing provider with its model", () => {
    expect(
      rateKeyFor({ id: "openai", options: { model: "gpt-4.1-mini", maxOutputTokens: 4096 } }),
    ).toBe("openai/gpt-4.1-mini");
  });

  it("uses the bare provider id when the provider has no model", () => {
    expect(rateKeyFor({ id: "deepl", options: {} })).toBe("deepl");
  });

  it("qualifies a self-hosted endpoint with its model, so a rate can still be looked up", () => {
    expect(
      rateKeyFor({
        id: "openai-compatible",
        options: { baseUrl: "http://localhost:1234", model: "llama-3", maxOutputTokens: 4096 },
      }),
    ).toBe("openai-compatible/llama-3");
  });
});
