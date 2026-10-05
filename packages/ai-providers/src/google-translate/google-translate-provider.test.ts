import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "../errors.js";
import { PLACEHOLDER_UNSUPPORTED_MESSAGE } from "../placeholder-protection.js";
import type { ProviderNotice, TranslateRequest } from "../provider.js";
import { ProviderRegistry } from "../registry.js";
import type { GoogleTranslateCall } from "../test-support.js";
import {
  entry,
  firstCallOf,
  googleTranslateError,
  googleTranslateStubClient,
  googleTranslateSuccess,
  regexExtractor,
  termGlossary,
} from "../test-support.js";
import { createGoogleTranslateProvider } from "./google-translate-provider.js";
import { GOOGLE_TRANSLATE_MAX_TEXT_PAYLOAD_BYTES } from "./limits.js";
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
      request({ glossary: termGlossary({ Hello: "Hallo" }), entries: [entry("k", "Hello")] }),
    )) as GoogleTranslateResult;
    expect(noticeCodes(result)).toContain("GLOSSARY_IGNORED");
    expect(result.values.get("k")).toBe("x");
  });
});

describe("createGoogleTranslateProvider: glossary notices by kind of term", () => {
  it("reports GLOSSARY_IGNORED for a do-not-translate term it cannot keep", async () => {
    const { client } = googleTranslateStubClient(googleTranslateSuccess(["x"]));
    const result = (await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({
        glossary: { terms: [], doNotTranslate: [{ term: "verbatra", caseSensitive: true }] },
        entries: [entry("k", "Hello")],
      }),
    )) as GoogleTranslateResult;
    expect(noticeCodes(result)).toContain("GLOSSARY_IGNORED");
  });

  it("raises no notice for forbidden renderings, which it checks rather than applies", async () => {
    const { client } = googleTranslateStubClient(googleTranslateSuccess(["Instrumententafel"]));
    const result = (await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({
        glossary: {
          terms: [{ source: "Dashboard", forbidden: ["Instrumententafel"], caseSensitive: false }],
          doNotTranslate: [],
        },
        entries: [entry("k", "Dashboard")],
      }),
    )) as GoogleTranslateResult;
    expect(noticeCodes(result)).not.toContain("GLOSSARY_IGNORED");
    expect(result.reviewFlags?.get("k")?.reasons).toEqual(["GLOSSARY_FORBIDDEN_TERM"]);
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

const ICU_PLURAL = entry("files", "{n, plural, one {# file} other {# files}}", ["{n}"]);
const SPAN = (marker: string): string => `<span translate="no">${marker}</span>`;

function googleMappingClient(translateText: (text: string) => string): {
  client: GoogleTranslateClient;
  calls: GoogleTranslateCall[];
} {
  const calls: GoogleTranslateCall[] = [];
  const client: GoogleTranslateClient = {
    translate: async (texts, sourceLang, targetLang, format) => {
      calls.push({ texts, sourceLang, targetLang, format });
      return googleTranslateSuccess(texts.map(translateText));
    },
  };
  return { client, calls };
}

describe("createGoogleTranslateProvider: placeholder masking", () => {
  const mixed = entry("mixed", "Hello {{name}}, you have %d items", ["{{name}}", "%d"]);

  it("sends placeholders as translate=no spans in html format and restores them byte-exact", async () => {
    const { client, calls } = googleMappingClient((text) =>
      text.replace("Hello", "Hallo").replace("you have", "du hast").replace("items", "Artikel"),
    );
    const result = (await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({ entries: [mixed] }),
    )) as GoogleTranslateResult;

    expect(calls).toHaveLength(1);
    expect(firstCallOf(calls).format).toBe("html");
    expect(firstCallOf(calls).texts).toEqual([
      `Hello ${SPAN("{0}")}, you have ${SPAN("{1}")} items`,
    ]);
    expect(result.values.get("mixed")).toBe("Hallo {{name}}, du hast %d Artikel");
    expect(result.integrity.get("mixed")?.matches).toBe(true);
    expect(noticeCodes(result)).not.toContain("PLACEHOLDER_UNSUPPORTED");
  });

  it("decodes the html entities the service returns", async () => {
    const { client, calls } = googleMappingClient((text) =>
      text.replaceAll("&amp;", "&#38;").replaceAll("'", "&#39;"),
    );
    const value = entry("amp", "Tom & Jerry's {{name}}", ["{{name}}"]);
    const result = await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({ entries: [value] }),
    );
    expect(firstCallOf(calls).texts).toEqual([`Tom &amp; Jerry's ${SPAN("{0}")}`]);
    expect(result.values.get("amp")).toBe(value.value);
  });

  it("restores a span that came back with style and dir attributes", async () => {
    const { client } = googleMappingClient((text) =>
      text.replace(
        '<span translate="no">',
        '<span translate="no" style="text-align:right" dir="rtl">',
      ),
    );
    const result = await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({ targetLocale: "ar", entries: [mixed] }),
    );
    expect(result.values.get("mixed")).toBe(mixed.value);
  });

  it("sends placeholder-free values in their own text-format call, exactly as before", async () => {
    const { client, calls } = googleMappingClient((text) => text);
    await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({ entries: [entry("free", "Free\nline"), mixed] }),
    );
    expect(calls.map((call) => [call.format, call.texts])).toEqual([
      ["text", ["Free\nline"]],
      ["html", [`Hello ${SPAN("{0}")}, you have ${SPAN("{1}")} items`]],
    ]);
  });

  it.each([
    ["drops a marker", (text: string) => text.replace(SPAN("{1}"), "")],
    ["duplicates a marker", (text: string) => `${text} ${SPAN("{0}")}`],
    ["rewrites a marker", (text: string) => text.replace(SPAN("{1}"), SPAN("{7}"))],
    ["returns a marker without its span", (text: string) => text.replace(SPAN("{1}"), "{1}")],
    ["returns an entity verbatra does not know", (text: string) => `${text}&nbsp;`],
  ])("withholds the key when the service %s", async (_case, mangle) => {
    const { client } = googleMappingClient((text) =>
      text.includes("<span") ? mangle(text) : text,
    );
    const result = (await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({ entries: [entry("free", "Free"), mixed] }),
    )) as GoogleTranslateResult;
    expect(result.values.has("mixed")).toBe(false);
    expect(result.integrity.has("mixed")).toBe(false);
    expect(result.values.get("free")).toBe("Free");
    expect(noticeCodes(result)).toContain("PLACEHOLDER_UNSUPPORTED");
  });

  it.each([
    ["an ICU plural", ICU_PLURAL],
    ["markup", entry("rich", "Open <b>{{name}}</b>", ["{{name}}", "<b>", "</b>"])],
    ["an angle bracket beside the placeholder", entry("cmp", "a < b for {{name}}", ["{{name}}"])],
    ["a line break", entry("nl", "Hi {{name}},\nwelcome", ["{{name}}"])],
    ["a carriage return", entry("cr", "Hi {{name}},\rwelcome", ["{{name}}"])],
    ["a tab", entry("tab", "Hi {{name}}\twelcome", ["{{name}}"])],
    ["a double space", entry("wide", "Hi {{name}}.  Welcome", ["{{name}}"])],
  ])("withholds a value with %s and never sends it", async (_case, value) => {
    const translate = vi.fn();
    const result = (await createGoogleTranslateProvider(config, {
      client: { translate },
    }).translateBatch(request({ entries: [value] }))) as GoogleTranslateResult;
    expect(translate).not.toHaveBeenCalled();
    expect(result.values.size).toBe(0);
    expect(noticeCodes(result)).toContain("PLACEHOLDER_UNSUPPORTED");
  });

  it("withholds an ICU plural even when the request names the target's plural categories", async () => {
    const { client, calls } = googleTranslateStubClient(googleTranslateSuccess(["Frei"]));
    const result = (await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({
        entries: [entry("free", "Free"), ICU_PLURAL],
        pluralCategories: { cardinal: ["one", "few", "many", "other"], ordinal: ["other"] },
      }),
    )) as GoogleTranslateResult;
    expect(firstCallOf(calls).texts).toEqual(["Free"]);
    expect(result.values.has("files")).toBe(false);
    expect(noticeCodes(result)).toContain("PLACEHOLDER_UNSUPPORTED");
  });

  it("emits a PLACEHOLDER_UNSUPPORTED notice whose message is static and names no key", async () => {
    const { client } = googleTranslateStubClient(googleTranslateSuccess(["Frei"]));
    const result = (await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({ entries: [entry("free", "Free"), { ...ICU_PLURAL, key: "secret-key" }] }),
    )) as GoogleTranslateResult;
    const notice = result.notices.find((n) => n.code === "PLACEHOLDER_UNSUPPORTED");
    expect(notice?.message).toBe(PLACEHOLDER_UNSUPPORTED_MESSAGE);
    expect(notice?.message).not.toContain("secret-key");
  });

  it("chunks masked values by their encoded wire text, not by the source value", async () => {
    const { client, calls } = googleMappingClient((text) => text);
    const dense = "%s".repeat(5000);
    const entries = [entry("a", dense, ["%s"]), entry("b", dense, ["%s"])];
    const result = await createGoogleTranslateProvider(config, { client }).translateBatch(
      request({ entries }),
    );
    expect(calls).toHaveLength(2);
    expect(result.values.get("a")).toBe(dense);
    expect(result.values.get("b")).toBe(dense);
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

describe("createGoogleTranslateProvider: locale codes sent to Cloud Translation", () => {
  it("maps a Traditional Chinese script locale to zh-TW and a Simplified one to zh-CN", async () => {
    const traditional = googleTranslateStubClient(googleTranslateSuccess(["x"]));
    await createGoogleTranslateProvider(config, { client: traditional.client }).translateBatch(
      request({ targetLocale: "zh-Hant", entries: [entry("k", "v")] }),
    );
    expect(firstCallOf(traditional.calls).targetLang).toBe("zh-TW");

    const simplified = googleTranslateStubClient(googleTranslateSuccess(["x"]));
    await createGoogleTranslateProvider(config, { client: simplified.client }).translateBatch(
      request({ sourceLocale: "zh-Hans", targetLocale: "en", entries: [entry("k", "v")] }),
    );
    expect(firstCallOf(simplified.calls).sourceLang).toBe("zh-CN");
  });

  it("lets an explicit localeMap entry win over the built-in normalization", async () => {
    const { client, calls } = googleTranslateStubClient(googleTranslateSuccess(["x"]));
    await createGoogleTranslateProvider(
      { localeMap: { "zh-Hant": "zh-HK", en: "en-GB" } },
      { client },
    ).translateBatch(request({ targetLocale: "zh-Hant", entries: [entry("k", "v")] }));
    expect(firstCallOf(calls)).toMatchObject({ sourceLang: "en-GB", targetLang: "zh-HK" });
  });

  it("rejects a malformed mapped code as INVALID_REQUEST before calling translate", async () => {
    const translate = vi.fn();
    const client: GoogleTranslateClient = { translate };
    await expect(
      createGoogleTranslateProvider({ localeMap: { de: "de_DE" } }, { client }).translateBatch(
        request({ entries: [entry("k", "v")] }),
      ),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      message: expect.stringContaining('"de_DE"'),
    });
    expect(translate).not.toHaveBeenCalled();
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
        request({
          glossary: termGlossary({ Hello: "Hallo" }),
          entries: [entry("a", "A?"), entry("b", "B?")],
        }),
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
