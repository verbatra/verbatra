import { afterEach, describe, expect, it, vi } from "vitest";
import { deepLLanguageSupport } from "./deepl/language-support.js";
import { ProviderError } from "./errors.js";
import { googleTranslateLanguageSupport } from "./google-translate/language-support.js";
import {
  isWellTestedLanguage,
  LANGUAGE_LIST_TIMEOUT_MS,
  liveTableVersion,
  matchLanguage,
  providerCodeFor,
  requestLanguageList,
  supportsFormality,
  supportsGlossaryPair,
} from "./language-support.js";
import { llmLanguageSupport } from "./llm/well-tested-languages.js";
import type { FetchLike } from "./network/guarded-fetch.js";
import { NetworkPolicyViolation } from "./network/guarded-fetch.js";
import type { ClientTransport } from "./network/transport.js";
import type { ProviderLanguageTable } from "./provider.js";

const table: ProviderLanguageTable = {
  version: "2026-01-01",
  origin: "static",
  documentation: ["https://example.test/languages"],
  languages: [
    { code: "EN", source: true, target: false, glossary: true, formality: false },
    { code: "EN-GB", source: false, target: true, glossary: true, formality: false },
    { code: "DE", source: true, target: true, glossary: true, formality: true },
    { code: "JA", source: true, target: true, glossary: false, formality: true },
    { code: "TH", source: true, target: true, glossary: false, formality: false },
  ],
};

describe("matchLanguage", () => {
  it("matches a listed code exactly, ignoring case", () => {
    expect(matchLanguage(table, "de", "target")).toBe("exact");
    expect(matchLanguage(table, "en-gb", "target")).toBe("exact");
  });

  it("falls back to the base language of a regional code", () => {
    expect(matchLanguage(table, "DE-AT", "target")).toBe("base");
  });

  it("honours the role a language is listed for", () => {
    expect(matchLanguage(table, "EN", "target")).toBe("none");
    expect(matchLanguage(table, "EN", "source")).toBe("exact");
    expect(matchLanguage(table, "EN-GB", "source")).toBe("base");
  });

  it("finds nothing for an unlisted language", () => {
    expect(matchLanguage(table, "XX", "target")).toBe("none");
    expect(matchLanguage(table, "EN-AU", "target")).toBe("none");
  });
});

describe("supportsFormality", () => {
  it("reads the target language's own entry or its base language's", () => {
    expect(supportsFormality(table, "DE")).toBe(true);
    expect(supportsFormality(table, "DE-CH")).toBe(true);
    expect(supportsFormality(table, "TH")).toBe(false);
    expect(supportsFormality(table, "XX")).toBe(false);
  });
});

describe("supportsGlossaryPair", () => {
  it("needs both languages of the pair to support glossaries", () => {
    expect(supportsGlossaryPair(table, "EN", "DE")).toBe(true);
    expect(supportsGlossaryPair(table, "EN", "EN-GB")).toBe(true);
    expect(supportsGlossaryPair(table, "EN", "JA")).toBe(false);
    expect(supportsGlossaryPair(table, "JA", "DE")).toBe(false);
  });
});

describe("isWellTestedLanguage", () => {
  it("compares the base language, ignoring case", () => {
    expect(isWellTestedLanguage(["de"], "DE-AT")).toBe(true);
    expect(isWellTestedLanguage(["de"], "sw")).toBe(false);
  });
});

describe("providerCodeFor", () => {
  it("applies the provider's own normalization for each role", () => {
    expect(providerCodeFor(deepLLanguageSupport, "en-US", "source", undefined)).toEqual({
      code: "EN",
      mapped: false,
    });
    expect(providerCodeFor(deepLLanguageSupport, "zh-TW", "target", undefined)).toEqual({
      code: "ZH-HANT",
      mapped: false,
    });
    expect(providerCodeFor(googleTranslateLanguageSupport, "nb", "target", {})).toEqual({
      code: "no",
      mapped: false,
    });
    expect(providerCodeFor(llmLanguageSupport, "pt-BR", "target", undefined)).toEqual({
      code: "pt-BR",
      mapped: false,
    });
  });

  it("takes an explicit localeMap entry and says so", () => {
    expect(providerCodeFor(deepLLanguageSupport, "de-AT", "target", { "de-AT": "DE" })).toEqual({
      code: "DE",
      mapped: true,
    });
  });
});

describe("liveTableVersion", () => {
  it("dates a live table by its UTC day", () => {
    expect(liveTableVersion(new Date("2026-03-04T23:59:00Z"))).toBe("2026-03-04");
  });
});

function transportAnswering(send: FetchLike): ClientTransport<FetchLike> {
  return { options: send, run: (call) => call() };
}

async function failureOf(promise: Promise<unknown>): Promise<ProviderError> {
  const error = await promise.then(
    () => undefined,
    (reason: unknown) => reason,
  );
  if (!(error instanceof ProviderError)) {
    throw new Error("expected a ProviderError");
  }
  return error;
}

describe("requestLanguageList", () => {
  it("sends a bounded GET with the given headers and returns the parsed body", async () => {
    const send = vi.fn<FetchLike>(async () => Response.json([{ lang: "de" }]));
    const body = await requestLanguageList(
      transportAnswering(send),
      "https://example.test/languages",
      { authorization: "token" },
      "Example language list",
    );

    expect(body).toEqual([{ lang: "de" }]);
    const init = send.mock.calls[0]?.[1];
    expect(init?.method).toBe("GET");
    expect(init?.headers).toEqual({ authorization: "token" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(LANGUAGE_LIST_TIMEOUT_MS).toBe(30_000);
  });

  it.each([
    [401, "AUTH_FAILED"],
    [403, "AUTH_FAILED"],
    [429, "RATE_LIMITED"],
    [503, "PROVIDER_UNAVAILABLE"],
    [404, "PROVIDER_ERROR"],
  ])("maps an HTTP %i answer to %s", async (status, code) => {
    const send: FetchLike = async () => new Response("{}", { status });
    const error = await failureOf(
      requestLanguageList(transportAnswering(send), "https://example.test", {}, "Example list"),
    );

    expect(error.code).toBe(code);
    expect(error.message).toBe(`The Example list request was answered with HTTP ${status}.`);
  });

  it("reports a body that is not JSON as INVALID_RESPONSE", async () => {
    const send: FetchLike = async () => new Response("not json", { status: 200 });
    const error = await failureOf(
      requestLanguageList(transportAnswering(send), "https://example.test", {}, "Example list"),
    );

    expect(error.code).toBe("INVALID_RESPONSE");
  });

  it("reports a refused host as NETWORK_POLICY_VIOLATION", async () => {
    const violation = new NetworkPolicyViolation("example.test", "The request was blocked.");
    const send: FetchLike = async () => {
      throw violation;
    };
    const error = await failureOf(
      requestLanguageList(transportAnswering(send), "https://example.test", {}, "Example list"),
    );

    expect(error.code).toBe("NETWORK_POLICY_VIOLATION");
    expect(error.message).toBe("The request was blocked.");
  });

  it("reports a timeout as TIMEOUT", async () => {
    const send: FetchLike = async () => {
      throw new DOMException("timed out", "TimeoutError");
    };
    const error = await failureOf(
      requestLanguageList(transportAnswering(send), "https://example.test", {}, "Example list"),
    );

    expect(error.code).toBe("TIMEOUT");
  });

  it("never repeats the transport's own error text, which can carry the request URL", async () => {
    const send: FetchLike = async () => {
      throw new TypeError("fetch failed for https://example.test/?key=secret-value");
    };
    const error = await failureOf(
      requestLanguageList(transportAnswering(send), "https://example.test", {}, "Example list"),
    );

    expect(error.code).toBe("PROVIDER_ERROR");
    expect(error.message).toBe("The Example list request could not be sent.");
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});
