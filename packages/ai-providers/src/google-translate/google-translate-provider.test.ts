import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "../errors.js";
import type { ProviderNotice, TranslateRequest } from "../provider.js";
import { ProviderRegistry } from "../registry.js";
import {
  entry,
  firstCallOf,
  googleTranslateError,
  googleTranslateStubClient,
  googleTranslateSuccess,
  regexExtractor,
} from "../test-support.js";
import { createGoogleTranslateProvider } from "./google-translate-provider.js";
import { GOOGLE_TRANSLATE_MAX_TEXT_PAYLOAD_BYTES } from "./limits.js";
import { PLACEHOLDER_UNSUPPORTED_MESSAGE } from "./placeholders.js";
import type { GoogleTranslateClient, GoogleTranslateResult } from "./types.js";

const config = {};

function request(overrides: Partial<TranslateRequest> = {}): TranslateRequest {
  return {
    sourceLocale: "en",
    targetLocale: "de",
    entries: [entry("greeting", "Hello {{name}}", ["{{name}}"])],
    extractPlaceholders: regexExtractor,
    ...overrides,
  };
}

function noticeCodes(result: { notices: readonly ProviderNotice[] }): string[] {
  return result.notices.map((n) => n.code);
}

describe("createGoogleTranslateProvider: identity", () => {
  it("declares id google-translate and machine-translation kind, and never supports a glossary", () => {
    const { client } = googleTranslateStubClient(googleTranslateSuccess([]));
    const provider = createGoogleTranslateProvider(config, { client });
    expect(provider.id).toBe("google-translate");
    expect(provider.kind).toBe("machine-translation");
    expect(provider.supportsGlossary).toBe(false);
  });
});

describe("createGoogleTranslateProvider: ordered send and positional zip", () => {
  it("sends values as an ordered array and zips results back to keys by position", async () => {
    const { client, calls } = googleTranslateStubClient(googleTranslateSuccess(["A", "B"]));
    const result = await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({ entries: [entry("a", "A?"), entry("b", "B?")] }),
    );
    expect(firstCallOf(calls).texts).toEqual(["A?", "B?"]);
    expect(firstCallOf(calls).sourceLang).toBe("en");
    expect(firstCallOf(calls).targetLang).toBe("de");
    expect(result.values.get("a")).toBe("A");
    expect(result.values.get("b")).toBe("B");
    expect(result.usage).toBeUndefined();
  });

  it("rejects a length-mismatched result as INVALID_RESPONSE, never zips", async () => {
    const { client } = googleTranslateStubClient(googleTranslateSuccess(["only-one"]));
    await expect(
      createGoogleTranslateProvider(config, { client }).translateBatch(
        request({ entries: [entry("a", "A?"), entry("b", "B?")] }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

describe("createGoogleTranslateProvider: tone -> always degrades (no formality control in v2)", () => {
  it("signals FORMALITY_DOWNGRADED for formal and informal, not for neutral or absent", async () => {
    const formal = googleTranslateStubClient(googleTranslateSuccess(["x"]));
    const formalResult = (await createGoogleTranslateProvider(config, {
      client: formal.client,
    }).translateBatch(
      request({ tone: "formal", entries: [entry("k", "v")] }),
    )) as GoogleTranslateResult;
    expect(noticeCodes(formalResult)).toContain("FORMALITY_DOWNGRADED");

    const neutral = googleTranslateStubClient(googleTranslateSuccess(["x"]));
    const neutralResult = (await createGoogleTranslateProvider(config, {
      client: neutral.client,
    }).translateBatch(
      request({ tone: "neutral", entries: [entry("k", "v")] }),
    )) as GoogleTranslateResult;
    expect(noticeCodes(neutralResult)).not.toContain("FORMALITY_DOWNGRADED");
  });
});

describe("createGoogleTranslateProvider: glossary -> always ignored", () => {
  it("ignores a supplied generic term-map but signals it observably (not an error)", async () => {
    const { client } = googleTranslateStubClient(googleTranslateSuccess(["x"]));
    const result = (await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({ glossary: { Hello: "Hallo" }, entries: [entry("k", "Hello")] }),
    )) as GoogleTranslateResult;
    expect(noticeCodes(result)).toContain("GLOSSARY_IGNORED");
    expect(result.values.get("k")).toBe("x");
  });
});

describe("createGoogleTranslateProvider: description/meaning are context-only, never sent", () => {
  it("sends only the entry value, never the description, and never echoes it back", async () => {
    const { client, calls } = googleTranslateStubClient(googleTranslateSuccess(["Hallo"]));
    const result = await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({
        entries: [entry("greeting", "Hello", [], { description: "a friendly greeting" })],
      }),
    );
    expect(firstCallOf(calls).texts).toEqual(["Hello"]);
    expect(result.values.get("greeting")).toBe("Hallo");
  });
});

describe("createGoogleTranslateProvider: per-key integrity", () => {
  it("passes when a placeholder-free entry stays placeholder-free", async () => {
    const { client } = googleTranslateStubClient(googleTranslateSuccess(["Hallo"]));
    const result = await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({ entries: [entry("greeting", "Hello")] }),
    );
    expect(result.integrity.get("greeting")?.matches).toBe(true);
  });

  it("reports an added placeholder per key when the provider injects a token, not swallowed", async () => {
    const { client } = googleTranslateStubClient(googleTranslateSuccess(["Hallo {{x}}"]));
    const result = await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({ entries: [entry("greeting", "Hello")] }),
    );
    expect(result.integrity.get("greeting")?.matches).toBe(false);
    expect(result.integrity.get("greeting")?.extra).toEqual(["{{x}}"]);
  });
});

describe("createGoogleTranslateProvider: placeholder-bearing entries are withheld", () => {
  it("translates only placeholder-free entries and withholds placeholder-bearing ones", async () => {
    const { client, calls } = googleTranslateStubClient(googleTranslateSuccess(["Frei"]));
    const result = (await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({
        entries: [entry("free", "Free"), entry("bearing", "Hello {{name}}", ["{{name}}"])],
      }),
    )) as GoogleTranslateResult;

    expect(firstCallOf(calls).texts).toEqual(["Free"]);
    expect(result.values.get("free")).toBe("Frei");
    expect(result.integrity.get("free")?.matches).toBe(true);
    expect(result.values.has("bearing")).toBe(false);
    expect(result.integrity.has("bearing")).toBe(false);
    expect(noticeCodes(result).filter((c) => c === "PLACEHOLDER_UNSUPPORTED")).toHaveLength(1);
  });

  it("never calls translate when every entry is placeholder-bearing", async () => {
    const translate = vi.fn();
    const client: GoogleTranslateClient = { translate };
    const result = (await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({
        entries: [
          entry("a", "Hello {{name}}", ["{{name}}"]),
          entry("b", "{count, plural, one {# item} other {# items}}", ["count"]),
        ],
      }),
    )) as GoogleTranslateResult;

    expect(translate).not.toHaveBeenCalled();
    expect(result.values.size).toBe(0);
    expect(result.integrity.size).toBe(0);
    expect(noticeCodes(result)).toContain("PLACEHOLDER_UNSUPPORTED");
  });

  it("emits a PLACEHOLDER_UNSUPPORTED notice whose message is static and names no key", async () => {
    const { client } = googleTranslateStubClient(googleTranslateSuccess(["Frei"]));
    const result = (await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({
        entries: [entry("free", "Free"), entry("secret-key", "Hi {{name}}", ["{{name}}"])],
      }),
    )) as GoogleTranslateResult;
    const notice = result.notices.find((n) => n.code === "PLACEHOLDER_UNSUPPORTED");
    expect(notice?.message).toBe(PLACEHOLDER_UNSUPPORTED_MESSAGE);
    expect(notice?.message).not.toContain("secret-key");
    expect(notice?.message).not.toContain("{{name}}");
  });
});

describe("createGoogleTranslateProvider: mandatory extractor gate", () => {
  it("rejects a request without an extractor before any client call", async () => {
    const translate = vi.fn();
    const client: GoogleTranslateClient = { translate };
    const broken = { ...request(), extractPlaceholders: undefined } as unknown as TranslateRequest;
    await expect(
      createGoogleTranslateProvider(config, { client }).translateBatch(broken),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(translate).not.toHaveBeenCalled();
  });
});

describe("createGoogleTranslateProvider: locale validation (pre-flight, before any network call)", () => {
  it("rejects a malformed source locale as INVALID_REQUEST before calling translate", async () => {
    const translate = vi.fn();
    const client: GoogleTranslateClient = { translate };
    await expect(
      createGoogleTranslateProvider(config, { client }).translateBatch(
        request({ sourceLocale: "en_US", entries: [entry("k", "v")] }),
      ),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      message: expect.stringContaining('"en_US"'),
    });
    expect(translate).not.toHaveBeenCalled();
  });

  it("rejects a malformed target locale as INVALID_REQUEST before calling translate", async () => {
    const translate = vi.fn();
    const client: GoogleTranslateClient = { translate };
    await expect(
      createGoogleTranslateProvider(config, { client }).translateBatch(
        request({ targetLocale: "de_DE", entries: [entry("k", "v")] }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(translate).not.toHaveBeenCalled();
  });

  it("accepts a regional target locale unmodified (unlike DeepL, v2 permits region subtags)", async () => {
    const { client, calls } = googleTranslateStubClient(googleTranslateSuccess(["x"]));
    const result = await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({ targetLocale: "pt-BR", entries: [entry("k", "v")] }),
    );
    expect(firstCallOf(calls).targetLang).toBe("pt-BR");
    expect(result.values.get("k")).toBe("x");
  });
});

describe("createGoogleTranslateProvider: API error mapping", () => {
  it("maps a 401 response to AUTH_FAILED naming the env var, never the key value", async () => {
    const { client } = googleTranslateStubClient(googleTranslateError(401));
    let caught: unknown;
    try {
      await createGoogleTranslateProvider(config, { client }).translateBatch(
        request({ entries: [entry("k", "v")] }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProviderError);
    expect((caught as ProviderError).code).toBe("AUTH_FAILED");
    expect((caught as ProviderError).message).toContain("GOOGLE_TRANSLATE_API_KEY");
    expect((caught as ProviderError).message).not.toContain("AIza");
  });

  it("maps a 403 with a quota reason to RATE_LIMITED, distinct from an auth failure", async () => {
    const { client } = googleTranslateStubClient(googleTranslateError(403, ["dailyLimitExceeded"]));
    await expect(
      createGoogleTranslateProvider(config, { client }).translateBatch(
        request({ entries: [entry("k", "v")] }),
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("maps a 403 with no quota reason to AUTH_FAILED", async () => {
    const { client } = googleTranslateStubClient(googleTranslateError(403, ["keyInvalid"]));
    await expect(
      createGoogleTranslateProvider(config, { client }).translateBatch(
        request({ entries: [entry("k", "v")] }),
      ),
    ).rejects.toMatchObject({ code: "AUTH_FAILED" });
  });

  it("maps a 429 response to RATE_LIMITED", async () => {
    const { client } = googleTranslateStubClient(googleTranslateError(429));
    await expect(
      createGoogleTranslateProvider(config, { client }).translateBatch(
        request({ entries: [entry("k", "v")] }),
      ),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
  });

  it("maps a 400 response to INVALID_REQUEST (unsupported language pair or malformed request)", async () => {
    const { client } = googleTranslateStubClient(googleTranslateError(400));
    await expect(
      createGoogleTranslateProvider(config, { client }).translateBatch(
        request({ entries: [entry("k", "v")] }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
  });

  it("maps a 503 response to PROVIDER_UNAVAILABLE", async () => {
    const { client } = googleTranslateStubClient(googleTranslateError(503));
    await expect(
      createGoogleTranslateProvider(config, { client }).translateBatch(
        request({ entries: [entry("k", "v")] }),
      ),
    ).rejects.toMatchObject({ code: "PROVIDER_UNAVAILABLE" });
  });
});

describe("createGoogleTranslateProvider: errors and secrets", () => {
  it("never re-throws a raw network error and leaks no key", async () => {
    const secret = `AIza${"a".repeat(35)}`;
    const translate = vi.fn(async () => {
      throw new Error(`request to https://translation.googleapis.com/...?key=${secret} failed`);
    });
    const client: GoogleTranslateClient = { translate };
    try {
      await createGoogleTranslateProvider(config, { client }).translateBatch(
        request({ entries: [entry("k", "v")] }),
      );
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ProviderError).code).toBe("PROVIDER_ERROR");
      const text = `${(error as ProviderError).message} ${(error as ProviderError).stack ?? ""}`;
      expect(text).not.toContain(secret);
    }
  });

  it("a failed translation carries no notices (notices ride a successful result only)", async () => {
    const { client } = googleTranslateStubClient(googleTranslateSuccess(["only-one"]));
    let caught: unknown;
    try {
      await createGoogleTranslateProvider(config, { client }).translateBatch(
        request({ glossary: { Hello: "Hallo" }, entries: [entry("a", "A?"), entry("b", "B?")] }),
      );
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ProviderError);
    expect((caught as ProviderError).code).toBe("INVALID_RESPONSE");
    expect(caught).not.toHaveProperty("notices");
  });
});

describe("createGoogleTranslateProvider: cancellation and timeout", () => {
  it("rejects immediately without calling translate when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const translate = vi.fn();
    const client: GoogleTranslateClient = { translate };
    let caught: unknown;
    try {
      await createGoogleTranslateProvider(config, { client }).translateBatch(
        request({ entries: [entry("k", "v")], signal: controller.signal }),
      );
      expect.unreachable("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(caught).not.toBeInstanceOf(ProviderError);
    expect(translate).not.toHaveBeenCalled();
  });

  it("bounds a hung request with a retriable TIMEOUT ProviderError", async () => {
    vi.useFakeTimers();
    try {
      const translate = vi.fn(() => new Promise<never>(() => {}));
      const client: GoogleTranslateClient = { translate };
      const provider = createGoogleTranslateProvider({ requestTimeoutMs: 5000 }, { client });
      const rejection = provider
        .translateBatch(request({ entries: [entry("k", "Free")] }))
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(5000);
      const error = await rejection;
      expect(translate).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).code).toBe("TIMEOUT");
      expect((error as ProviderError).message).toContain("5000");
    } finally {
      vi.useRealTimers();
    }
  });

  it("applies the shared default timeout when the config omits requestTimeoutMs", async () => {
    vi.useFakeTimers();
    try {
      const translate = vi.fn(() => new Promise<never>(() => {}));
      const client: GoogleTranslateClient = { translate };
      const provider = createGoogleTranslateProvider(config, { client });
      const rejection = provider
        .translateBatch(request({ entries: [entry("k", "Free")] }))
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(120_000);
      const error = await rejection;
      expect(translate).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).code).toBe("TIMEOUT");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createGoogleTranslateProvider: key from env only", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.GOOGLE_TRANSLATE_API_KEY;
  });
  afterEach(() => {
    if (saved === undefined) {
      delete process.env.GOOGLE_TRANSLATE_API_KEY;
    } else {
      process.env.GOOGLE_TRANSLATE_API_KEY = saved;
    }
  });

  it("missing GOOGLE_TRANSLATE_API_KEY yields a key-free MISSING_API_KEY before any client call", () => {
    delete process.env.GOOGLE_TRANSLATE_API_KEY;
    try {
      createGoogleTranslateProvider(config);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ProviderError).code).toBe("MISSING_API_KEY");
      expect((error as ProviderError).message).toContain("GOOGLE_TRANSLATE_API_KEY");
      expect((error as ProviderError).message).not.toContain("AIza");
    }
  });

  it("builds the default client when the env key is present", () => {
    process.env.GOOGLE_TRANSLATE_API_KEY = `AIza${"a".repeat(35)}`;
    expect(createGoogleTranslateProvider(config).id).toBe("google-translate");
  });
});

describe("createGoogleTranslateProvider: comparePlaceholders wiring", () => {
  it("passes request.comparePlaceholders through to the protectable-entry integrity check", async () => {
    const { client } = googleTranslateStubClient(googleTranslateSuccess(["Frei"]));
    const calls: Array<{ source: string; translated: string }> = [];
    const comparePlaceholders = (
      source: string,
      translated: string,
    ): ReturnType<NonNullable<TranslateRequest["comparePlaceholders"]>> => {
      calls.push({ source, translated });
      return { matches: true, missing: [], extra: [], reordered: false };
    };

    await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({ entries: [entry("k", "Free")], comparePlaceholders }),
    );

    expect(calls).toEqual([{ source: "Free", translated: "Frei" }]);
  });
});

describe("createGoogleTranslateProvider: internal per-request chunking", () => {
  it("splits an over-cap sub-batch into multiple sequential translate calls and merges the results", async () => {
    const calls: Array<{ texts: readonly string[] }> = [];
    const client: GoogleTranslateClient = {
      translate: async (texts) => {
        calls.push({ texts });
        return googleTranslateSuccess(texts.map((text) => `${text}!`));
      },
    };
    const bigText = "x".repeat(GOOGLE_TRANSLATE_MAX_TEXT_PAYLOAD_BYTES);
    const entries = [entry("a", bigText), entry("b", bigText)];
    const result = await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({ entries }),
    );

    expect(calls.length).toBeGreaterThan(1);
    expect(result.values.get("a")).toBe(`${bigText}!`);
    expect(result.values.get("b")).toBe(`${bigText}!`);
  });
});

describe("createGoogleTranslateProvider: reviewFlags", () => {
  it("applies PROVIDER_DEGRADED to every accepted key of a degraded batch", async () => {
    const { client } = googleTranslateStubClient(googleTranslateSuccess(["x", "y"]));
    const result = (await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({ tone: "formal", entries: [entry("a", "v1"), entry("b", "v2")] }),
    )) as GoogleTranslateResult;
    expect(result.reviewFlags?.get("a")?.reasons).toEqual(["PROVIDER_DEGRADED"]);
    expect(result.reviewFlags?.get("b")?.reasons).toEqual(["PROVIDER_DEGRADED"]);
  });

  it("applies no PROVIDER_DEGRADED reason on a non-degraded batch", async () => {
    const { client } = googleTranslateStubClient(googleTranslateSuccess(["Hallo"]));
    const result = (await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({ entries: [entry("greeting", "Hello, colleague")] }),
    )) as GoogleTranslateResult;
    expect(result.reviewFlags?.get("greeting")?.reasons ?? []).not.toContain("PROVIDER_DEGRADED");
  });
});

describe("createGoogleTranslateProvider: registry", () => {
  it("resolves under id google-translate without disturbing an existing provider", () => {
    const { client } = googleTranslateStubClient(googleTranslateSuccess([]));
    const provider = createGoogleTranslateProvider(config, { client });
    const registry = new ProviderRegistry();
    registry.register({ ...provider, id: "openai" }).register(provider);
    expect(registry.resolve("openai").status).toBe("resolved");
    const resolved = registry.resolve("google-translate");
    expect(resolved.status).toBe("resolved");
    if (resolved.status === "resolved") {
      expect(resolved.provider.kind).toBe("machine-translation");
    }
  });
});
