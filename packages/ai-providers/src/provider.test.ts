import { describe, expect, it } from "vitest";
import { ProviderError } from "./errors.js";
import { type TranslateRequest, validateRequest } from "./provider.js";
import { entry, regexExtractor } from "./test-support.js";

function baseRequest(overrides: Partial<TranslateRequest> = {}): TranslateRequest {
  return {
    sourceLocale: "en",
    targetLocale: "de",
    entries: [entry("greeting", "Hello")],
    extractPlaceholders: regexExtractor,
    ...overrides,
  };
}

describe("validateRequest", () => {
  it("returns the parsed data for a valid request", () => {
    const data = validateRequest(baseRequest());
    expect(data.sourceLocale).toBe("en");
    expect(data.entries).toHaveLength(1);
  });

  it("rejects a request whose extractor is not a function (mandatory extractor)", () => {
    const request = baseRequest();
    const broken = { ...request, extractPlaceholders: undefined } as unknown as TranslateRequest;
    try {
      validateRequest(broken);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).code).toBe("INVALID_REQUEST");
    }
  });

  it("carries a per-key maximum length budget through to the parsed data", () => {
    const data = validateRequest(baseRequest({ maxLength: new Map([["greeting", 12]]) }));
    expect(data.maxLength?.get("greeting")).toBe(12);
  });

  it("rejects a fractional maximum length budget", () => {
    expect(() => validateRequest(baseRequest({ maxLength: new Map([["greeting", 1.5]]) }))).toThrow(
      ProviderError,
    );
  });

  it("rejects a negative maximum length budget", () => {
    expect(() => validateRequest(baseRequest({ maxLength: new Map([["greeting", -1]]) }))).toThrow(
      ProviderError,
    );
  });

  it("rejects an empty batch", () => {
    expect(() => validateRequest(baseRequest({ entries: [] }))).toThrow(ProviderError);
  });

  it("rejects an empty source locale", () => {
    expect(() => validateRequest(baseRequest({ sourceLocale: "" }))).toThrow(ProviderError);
  });

  it("accepts a request carrying a signal, but the signal is not part of the validated plain data", () => {
    const controller = new AbortController();
    const data = validateRequest(baseRequest({ signal: controller.signal }));
    expect(data).not.toHaveProperty("signal");
  });

  it("validates the same whether or not a signal is present", () => {
    expect(() => validateRequest(baseRequest())).not.toThrow();
    expect(() =>
      validateRequest(baseRequest({ signal: new AbortController().signal })),
    ).not.toThrow();
  });
});
