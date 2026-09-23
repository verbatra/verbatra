import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "../errors.js";
import type { ProviderNotice, TranslateRequest } from "../provider.js";
import { ProviderRegistry } from "../registry.js";
import type { DeepLCall } from "../test-support.js";
import {
  deeplResult,
  deeplStubClient,
  entry,
  firstCallOf,
  regexExtractor,
} from "../test-support.js";
import type { DeepLConfig } from "./config.js";
import { createDeepLProvider } from "./deepl-provider.js";
import { DEEPL_MAX_TEXTS_PER_REQUEST } from "./limits.js";
import { PLACEHOLDER_UNSUPPORTED_MESSAGE } from "./placeholders.js";
import type { DeepLTranslateClient, DeepLTranslateResult } from "./types.js";

function deeplEchoStubClient(): { client: DeepLTranslateClient; calls: DeepLCall[] } {
  const calls: DeepLCall[] = [];
  const client: DeepLTranslateClient = {
    translateText: async (texts, sourceLang, targetLang, options) => {
      calls.push({ texts, sourceLang, targetLang, options });
      return texts.map((text) => ({ text: `${text}!` }));
    },
  };
  return { client, calls };
}

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

describe("createDeepLProvider: identity", () => {
  it("declares id deepl and machine-translation kind", () => {
    const { client } = deeplStubClient(deeplResult([]));
    const provider = createDeepLProvider(config, { client });
    expect(provider.id).toBe("deepl");
    expect(provider.kind).toBe("machine-translation");
  });
});

describe("createDeepLProvider: honest supportsGlossary", () => {
  it("reports false for the generic term-map-only case (no native glossaryId configured)", () => {
    const { client } = deeplStubClient(deeplResult([]));
    const provider = createDeepLProvider(config, { client });
    expect(provider.supportsGlossary).toBe(false);
  });

  it("reports true when a native glossaryId is configured", () => {
    const { client } = deeplStubClient(deeplResult([]));
    const provider = createDeepLProvider({ glossaryId: "gl-123" }, { client });
    expect(provider.supportsGlossary).toBe(true);
  });
});

describe("createDeepLProvider: ordered send and positional zip", () => {
  it("sends values as an ordered array and zips results back to keys by position", async () => {
    const { client, calls } = deeplStubClient(deeplResult(["A", "B"]));
    const result = await createDeepLProvider(config, { client }).translateBatch(
      request({ entries: [entry("a", "A?"), entry("b", "B?")] }),
    );
    expect(firstCallOf(calls).texts).toEqual(["A?", "B?"]);
    expect(firstCallOf(calls).sourceLang).toBe("EN");
    expect(firstCallOf(calls).targetLang).toBe("DE");
    expect(result.values.get("a")).toBe("A");
    expect(result.values.get("b")).toBe("B");
    expect(result.usage).toBeUndefined();
  });

  it("rejects a length-mismatched result (fewer) as INVALID_RESPONSE, never zips", async () => {
    const { client } = deeplStubClient(deeplResult(["only-one"]));
    await expect(
      createDeepLProvider(config, { client }).translateBatch(
        request({ entries: [entry("a", "A?"), entry("b", "B?")] }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("rejects a length-mismatched result (more) as INVALID_RESPONSE", async () => {
    const { client } = deeplStubClient(deeplResult(["x", "y"]));
    await expect(
      createDeepLProvider(config, { client }).translateBatch(
        request({ entries: [entry("k", "v")] }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });
});

describe("createDeepLProvider: tone -> formality", () => {
  it("maps formal -> more, informal -> less, neutral/absent -> omitted (pro key)", async () => {
    const a = deeplStubClient(deeplResult(["x"]));
    await createDeepLProvider(config, { client: a.client }).translateBatch(
      request({ tone: "formal", entries: [entry("k", "v")] }),
    );
    expect(firstCallOf(a.calls).options.formality).toBe("more");

    const b = deeplStubClient(deeplResult(["x"]));
    await createDeepLProvider(config, { client: b.client }).translateBatch(
      request({ tone: "informal", entries: [entry("k", "v")] }),
    );
    expect(firstCallOf(b.calls).options.formality).toBe("less");

    const c = deeplStubClient(deeplResult(["x"]));
    await createDeepLProvider(config, { client: c.client }).translateBatch(
      request({ tone: "neutral", entries: [entry("k", "v")] }),
    );
    expect(firstCallOf(c.calls).options.formality).toBeUndefined();
  });
});

describe("createDeepLProvider: free-key formality degradation", () => {
  it("on a :fx key with a non-default tone, degrades to default formality with an observable notice", async () => {
    const { client, calls } = deeplStubClient(deeplResult(["x"]));
    const result = (await createDeepLProvider(config, {
      client,
      freeAccount: true,
    }).translateBatch(
      request({ tone: "formal", entries: [entry("k", "v")] }),
    )) as DeepLTranslateResult;

    expect(firstCallOf(calls).options.formality).toBeUndefined();
    expect(noticeCodes(result)).toContain("FORMALITY_DOWNGRADED");
    const message = result.notices.map((n) => n.message).join(" ");
    expect(message).not.toContain(":fx");
    expect(message).not.toContain("sk-");
  });

  it("does not signal degradation on a :fx key when tone is neutral", async () => {
    const { client } = deeplStubClient(deeplResult(["x"]));
    const result = (await createDeepLProvider(config, {
      client,
      freeAccount: true,
    }).translateBatch(request({ entries: [entry("k", "v")] }))) as DeepLTranslateResult;
    expect(result.notices).toEqual([]);
  });
});

describe("createDeepLProvider: glossary", () => {
  it("passes a configured glossary id natively to translateText", async () => {
    const { client, calls } = deeplStubClient(deeplResult(["x"]));
    await createDeepLProvider({ glossaryId: "gl-123" }, { client }).translateBatch(
      request({ entries: [entry("k", "v")] }),
    );
    expect(firstCallOf(calls).options.glossary).toBe("gl-123");
  });

  it("ignores a supplied generic term-map but signals it observably (not an error)", async () => {
    const { client, calls } = deeplStubClient(deeplResult(["x"]));
    const result = (await createDeepLProvider(config, { client }).translateBatch(
      request({ glossary: { Hello: "Hallo" }, entries: [entry("k", "Hello")] }),
    )) as DeepLTranslateResult;
    expect(firstCallOf(calls).options.glossary).toBeUndefined();
    expect(noticeCodes(result)).toContain("GLOSSARY_IGNORED");
    expect(result.values.get("k")).toBe("x");
  });
});

describe("createDeepLProvider: description/meaning are context-only, never DeepL input", () => {
  it("sends only the entry value to DeepL, never the description, and never echoes it back", async () => {
    const { client, calls } = deeplStubClient(deeplResult(["Hallo"]));
    const result = await createDeepLProvider(config, { client }).translateBatch(
      request({
        entries: [entry("greeting", "Hello", [], { description: "a friendly greeting" })],
      }),
    );
    expect(firstCallOf(calls).texts).toEqual(["Hello"]);
    expect(result.values.get("greeting")).toBe("Hallo");
  });
});

describe("createDeepLProvider: per-key integrity (load-bearing for DeepL)", () => {
  it("passes when a placeholder-free entry stays placeholder-free", async () => {
    const { client } = deeplStubClient(deeplResult(["Hallo"]));
    const result = await createDeepLProvider(config, { client }).translateBatch(
      request({ entries: [entry("greeting", "Hello")] }),
    );
    expect(result.integrity.get("greeting")?.matches).toBe(true);
  });

  it("reports an added placeholder per key when DeepL injects a token, not swallowed", async () => {
    const { client } = deeplStubClient(deeplResult(["Hallo {{x}}"]));
    const result = await createDeepLProvider(config, { client }).translateBatch(
      request({ entries: [entry("greeting", "Hello")] }),
    );
    expect(result.integrity.get("greeting")?.matches).toBe(false);
    expect(result.integrity.get("greeting")?.extra).toEqual(["{{x}}"]);
  });
});

describe("createDeepLProvider: placeholder-bearing entries are withheld", () => {
  it("translates only placeholder-free entries and withholds placeholder-bearing ones", async () => {
    const { client, calls } = deeplStubClient(deeplResult(["Frei"]));
    const result = (await createDeepLProvider(config, { client }).translateBatch(
      request({
        entries: [entry("free", "Free"), entry("bearing", "Hello {{name}}", ["{{name}}"])],
      }),
    )) as DeepLTranslateResult;

    expect(firstCallOf(calls).texts).toEqual(["Free"]);
    expect(result.values.get("free")).toBe("Frei");
    expect(result.integrity.get("free")?.matches).toBe(true);
    expect(result.values.has("bearing")).toBe(false);
    expect(result.integrity.has("bearing")).toBe(false);
    expect(noticeCodes(result).filter((c) => c === "PLACEHOLDER_UNSUPPORTED")).toHaveLength(1);
  });

  it("never calls translateText when every entry is placeholder-bearing", async () => {
    const translateText = vi.fn();
    const client: DeepLTranslateClient = { translateText };
    const result = (await createDeepLProvider(config, { client }).translateBatch(
      request({
        entries: [
          entry("a", "Hello {{name}}", ["{{name}}"]),
          entry("b", "{count, plural, one {# item} other {# items}}", ["count"]),
        ],
      }),
    )) as DeepLTranslateResult;

    expect(translateText).not.toHaveBeenCalled();
    expect(result.values.size).toBe(0);
    expect(result.integrity.size).toBe(0);
    expect(noticeCodes(result)).toContain("PLACEHOLDER_UNSUPPORTED");
  });

  it("emits no PLACEHOLDER_UNSUPPORTED notice for a placeholder-free batch (no regression)", async () => {
    const { client } = deeplStubClient(deeplResult(["x"]));
    const result = (await createDeepLProvider({ glossaryId: "gl-1" }, { client }).translateBatch(
      request({ tone: "formal", entries: [entry("k", "v")] }),
    )) as DeepLTranslateResult;
    expect(noticeCodes(result)).not.toContain("PLACEHOLDER_UNSUPPORTED");
  });

  it("keeps formality and glossary notices unchanged alongside the placeholder notice", async () => {
    const { client } = deeplStubClient(deeplResult(["x"]));
    const result = (await createDeepLProvider(config, { client, freeAccount: true }).translateBatch(
      request({
        tone: "formal",
        glossary: { Hello: "Hallo" },
        entries: [entry("free", "Free"), entry("bearing", "Hi {{name}}", ["{{name}}"])],
      }),
    )) as DeepLTranslateResult;
    expect(noticeCodes(result)).toEqual(
      expect.arrayContaining([
        "FORMALITY_DOWNGRADED",
        "GLOSSARY_IGNORED",
        "PLACEHOLDER_UNSUPPORTED",
      ]),
    );
  });

  it("emits a PLACEHOLDER_UNSUPPORTED notice whose message is static and names no key", async () => {
    const { client } = deeplStubClient(deeplResult(["Frei"]));
    const result = (await createDeepLProvider(config, { client }).translateBatch(
      request({
        entries: [entry("free", "Free"), entry("secret-key", "Hi {{name}}", ["{{name}}"])],
      }),
    )) as DeepLTranslateResult;
    const notice = result.notices.find((n) => n.code === "PLACEHOLDER_UNSUPPORTED");
    expect(notice?.message).toBe(PLACEHOLDER_UNSUPPORTED_MESSAGE);
    expect(notice?.message).not.toContain("secret-key");
    expect(notice?.message).not.toContain("{{name}}");
  });
});

describe("createDeepLProvider: notice messages are static, never interpolated", () => {
  function noticeMessage(result: DeepLTranslateResult, code: ProviderNotice["code"]): string {
    const notice = result.notices.find((n) => n.code === code);
    if (notice === undefined) {
      throw new Error(`expected a ${code} notice`);
    }
    return notice.message;
  }

  it("GLOSSARY_IGNORED message is byte-identical across unrelated glossary content and keys", async () => {
    const first = deeplStubClient(deeplResult(["x"]));
    const firstResult = (await createDeepLProvider(config, { client: first.client }).translateBatch(
      request({ glossary: { Hello: "Hallo" }, entries: [entry("k1", "Hello")] }),
    )) as DeepLTranslateResult;

    const second = deeplStubClient(deeplResult(["y"]));
    const secondResult = (await createDeepLProvider(config, {
      client: second.client,
    }).translateBatch(
      request({
        glossary: { SecretTerm: "GeheimBegriff", AnotherTerm: "NochEinBegriff" },
        entries: [entry("very-different-key", "Something else entirely")],
      }),
    )) as DeepLTranslateResult;

    const firstMessage = noticeMessage(firstResult, "GLOSSARY_IGNORED");
    const secondMessage = noticeMessage(secondResult, "GLOSSARY_IGNORED");
    expect(firstMessage).toBe(secondMessage);
    expect(firstMessage).not.toContain("SecretTerm");
    expect(firstMessage).not.toContain("very-different-key");
  });

  it("FORMALITY_DOWNGRADED message is byte-identical across unrelated keys and both non-default tones", async () => {
    const formal = deeplStubClient(deeplResult(["x"]));
    const formalResult = (await createDeepLProvider(config, {
      client: formal.client,
      freeAccount: true,
    }).translateBatch(
      request({ tone: "formal", entries: [entry("secret-formal-key", "Some value")] }),
    )) as DeepLTranslateResult;

    const informal = deeplStubClient(deeplResult(["y"]));
    const informalResult = (await createDeepLProvider(config, {
      client: informal.client,
      freeAccount: true,
    }).translateBatch(
      request({ tone: "informal", entries: [entry("another-key", "A different value")] }),
    )) as DeepLTranslateResult;

    const formalMessage = noticeMessage(formalResult, "FORMALITY_DOWNGRADED");
    const informalMessage = noticeMessage(informalResult, "FORMALITY_DOWNGRADED");
    expect(formalMessage).toBe(informalMessage);
    expect(formalMessage).not.toContain("secret-formal-key");
    expect(formalMessage).not.toContain("another-key");
  });
});

describe("createDeepLProvider: mandatory extractor gate", () => {
  it("rejects a request without an extractor before any client call", async () => {
    const translateText = vi.fn();
    const client: DeepLTranslateClient = { translateText };
    const broken = { ...request(), extractPlaceholders: undefined } as unknown as TranslateRequest;
    await expect(
      createDeepLProvider(config, { client }).translateBatch(broken),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(translateText).not.toHaveBeenCalled();
  });
});

describe("createDeepLProvider: errors and secrets", () => {
  it("never re-throws the raw SDK/axios error and leaks no auth header or key", async () => {
    const secret = "deepl-SECRET-77";
    const translateText = vi.fn(async () => {
      throw new Error(`DeepL-Auth-Key: ${secret} Authorization: Bearer ${secret} config dump`);
    });
    const client: DeepLTranslateClient = { translateText };
    try {
      await createDeepLProvider(config, { client }).translateBatch(
        request({ entries: [entry("k", "v")] }),
      );
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ProviderError).code).toBe("PROVIDER_ERROR");
      const text = `${(error as ProviderError).message} ${(error as ProviderError).stack ?? ""}`;
      expect(text).not.toContain(secret);
      expect(text).not.toContain("DeepL-Auth-Key");
      expect(text).not.toContain("Authorization");
    }
  });

  it("a failed translation carries no notices (notices ride a successful result only)", async () => {
    const { client } = deeplStubClient(deeplResult(["only-one"]));
    let caught: unknown;
    try {
      await createDeepLProvider(config, { client }).translateBatch(
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

describe("createDeepLProvider: cancellation (best-effort, preflight only)", () => {
  it("rejects immediately without calling translateText when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const translateText = vi.fn();
    const client: DeepLTranslateClient = { translateText };
    let caught: unknown;
    try {
      await createDeepLProvider(config, { client }).translateBatch(
        request({ entries: [entry("k", "v")], signal: controller.signal }),
      );
      expect.unreachable("should have thrown");
    } catch (error) {
      caught = error;
    }
    expect(caught).not.toBeInstanceOf(ProviderError);
    expect(translateText).not.toHaveBeenCalled();
  });

  it("translates normally when the signal is present but never aborted", async () => {
    const controller = new AbortController();
    const { client } = deeplStubClient(deeplResult(["Frei"]));
    const result = await createDeepLProvider(config, { client }).translateBatch(
      request({ entries: [entry("k", "Free")], signal: controller.signal }),
    );
    expect(result.values.get("k")).toBe("Frei");
  });

  it("bounds a hung request with a retriable TIMEOUT ProviderError even though deepl-node cannot be cancelled", async () => {
    vi.useFakeTimers();
    try {
      const translateText = vi.fn(() => new Promise<never>(() => {}));
      const client: DeepLTranslateClient = { translateText };
      const provider = createDeepLProvider({ requestTimeoutMs: 5000 }, { client });
      const rejection = provider
        .translateBatch(request({ entries: [entry("k", "Free")] }))
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(5000);
      const error = await rejection;
      expect(translateText).toHaveBeenCalledTimes(1);
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
      const translateText = vi.fn(() => new Promise<never>(() => {}));
      const client: DeepLTranslateClient = { translateText };
      const provider = createDeepLProvider(config, { client });
      const rejection = provider
        .translateBatch(request({ entries: [entry("k", "Free")] }))
        .catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(120_000);
      const error = await rejection;
      expect(translateText).toHaveBeenCalledTimes(1);
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).code).toBe("TIMEOUT");
      expect((error as ProviderError).message).toContain("120000");
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("createDeepLProvider: key from env only", () => {
  let saved: string | undefined;
  beforeEach(() => {
    saved = process.env.DEEPL_API_KEY;
  });
  afterEach(() => {
    if (saved === undefined) {
      delete process.env.DEEPL_API_KEY;
    } else {
      process.env.DEEPL_API_KEY = saved;
    }
  });

  it("missing DEEPL_API_KEY yields a key-free MISSING_API_KEY before any client call", () => {
    delete process.env.DEEPL_API_KEY;
    try {
      createDeepLProvider(config);
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as ProviderError).code).toBe("MISSING_API_KEY");
      expect((error as ProviderError).message).not.toContain("sk-");
    }
  });

  it("builds the default client when the env key is present", () => {
    process.env.DEEPL_API_KEY = "deepl-test-key:fx";
    expect(createDeepLProvider(config).id).toBe("deepl");
  });
});

describe("createDeepLProvider: comparePlaceholders wiring", () => {
  it("passes request.comparePlaceholders through to the protectable-entry integrity check", async () => {
    const { client } = deeplStubClient(deeplResult(["Frei"]));
    const calls: Array<{ source: string; translated: string }> = [];
    const comparePlaceholders = (
      source: string,
      translated: string,
    ): ReturnType<NonNullable<TranslateRequest["comparePlaceholders"]>> => {
      calls.push({ source, translated });
      return { matches: true, missing: [], extra: [], reordered: false };
    };

    await createDeepLProvider(config, { client }).translateBatch(
      request({ entries: [entry("k", "Free")], comparePlaceholders }),
    );

    expect(calls).toEqual([{ source: "Free", translated: "Frei" }]);
  });
});

describe("createDeepLProvider: locale codes sent to DeepL", () => {
  async function sentLanguages(
    overrides: Partial<TranslateRequest>,
    providerConfig: DeepLConfig = config,
  ): Promise<{ sourceLang: string | null; targetLang: string }> {
    const { client, calls } = deeplStubClient(deeplResult(["x"]));
    await createDeepLProvider(providerConfig, { client }).translateBatch(
      request({ entries: [entry("k", "v")], ...overrides }),
    );
    const { sourceLang, targetLang } = firstCallOf(calls);
    return { sourceLang, targetLang };
  }

  it("strips the region from a regional source locale (en-US sends EN)", async () => {
    expect(await sentLanguages({ sourceLocale: "en-US", targetLocale: "de" })).toEqual({
      sourceLang: "EN",
      targetLang: "DE",
    });
  });

  it("strips region and script from a source locale (zh-Hant-TW sends ZH)", async () => {
    expect((await sentLanguages({ sourceLocale: "zh-Hant-TW" })).sourceLang).toBe("ZH");
  });

  it("maps a Traditional Chinese target to ZH-HANT and a Simplified one to ZH-HANS", async () => {
    expect((await sentLanguages({ targetLocale: "zh-Hant" })).targetLang).toBe("ZH-HANT");
    expect((await sentLanguages({ targetLocale: "zh-TW" })).targetLang).toBe("ZH-HANT");
    expect((await sentLanguages({ targetLocale: "zh-CN" })).targetLang).toBe("ZH-HANS");
  });

  it("keeps a DeepL regional target variant (pt-BR sends PT-BR)", async () => {
    expect((await sentLanguages({ targetLocale: "pt-BR" })).targetLang).toBe("PT-BR");
  });

  it("lets an explicit localeMap entry win over the built-in normalization", async () => {
    const mapped = await sentLanguages(
      { sourceLocale: "en-US", targetLocale: "es-MX" },
      { localeMap: { "en-US": "EN", "es-MX": "ES-419" } },
    );
    expect(mapped).toEqual({ sourceLang: "EN", targetLang: "ES-419" });
  });

  it("normalizes a locale the localeMap does not name", async () => {
    const mapped = await sentLanguages(
      { sourceLocale: "en-US", targetLocale: "zh-Hant" },
      { localeMap: { fr: "FR" } },
    );
    expect(mapped).toEqual({ sourceLang: "EN", targetLang: "ZH-HANT" });
  });

  it("keeps the project locale codes for review flags while DeepL sees the mapped codes", async () => {
    const { client, calls } = deeplStubClient(deeplResult(["Hallo"]));
    const result = await createDeepLProvider(config, { client }).translateBatch(
      request({ sourceLocale: "de", targetLocale: "de-AT", entries: [entry("k", "Hallo")] }),
    );
    expect(firstCallOf(calls)).toMatchObject({ sourceLang: "DE", targetLang: "DE" });
    expect(result.reviewFlags?.get("k")?.reasons).toContain("EQUALS_SOURCE");
  });

  it("rejects a mapped regional source code as INVALID_REQUEST before calling translateText", async () => {
    const translateText = vi.fn();
    const client: DeepLTranslateClient = { translateText };
    await expect(
      createDeepLProvider({ localeMap: { en: "EN-US" } }, { client }).translateBatch(
        request({ entries: [entry("k", "v")] }),
      ),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      message: expect.stringContaining('"EN-US" (for the locale "en")'),
    });
    expect(translateText).not.toHaveBeenCalled();
  });

  it("rejects a bare en target as INVALID_REQUEST before calling translateText", async () => {
    const translateText = vi.fn();
    const client: DeepLTranslateClient = { translateText };
    await expect(
      createDeepLProvider(config, { client }).translateBatch(
        request({ sourceLocale: "de", targetLocale: "en", entries: [entry("k", "v")] }),
      ),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST", message: expect.stringContaining('"EN"') });
    expect(translateText).not.toHaveBeenCalled();
  });

  it("rejects an English region DeepL has no variant for, pointing at localeMap", async () => {
    const translateText = vi.fn();
    const client: DeepLTranslateClient = { translateText };
    await expect(
      createDeepLProvider(config, { client }).translateBatch(
        request({ sourceLocale: "de", targetLocale: "en-AU", entries: [entry("k", "v")] }),
      ),
    ).rejects.toMatchObject({
      code: "INVALID_REQUEST",
      message: expect.stringContaining("provider.options.localeMap"),
    });
    expect(translateText).not.toHaveBeenCalled();
  });

  it("surfaces a mapped code DeepL itself rejects as a structured ProviderError", async () => {
    const translateText = vi.fn(async () => {
      throw Object.assign(
        new Error("Bad request, message: Value for 'target_lang' not supported."),
        {
          status: 400,
        },
      );
    });
    const client: DeepLTranslateClient = { translateText };
    await expect(
      createDeepLProvider({ localeMap: { de: "XX-YY" } }, { client }).translateBatch(
        request({ entries: [entry("k", "v")] }),
      ),
    ).rejects.toBeInstanceOf(ProviderError);
    expect(translateText).toHaveBeenCalledWith(["v"], "EN", "XX-YY", {});
  });
});

describe("createDeepLProvider: internal per-request chunking (independent of maxBatchSize)", () => {
  it("keeps an in-cap sub-batch in a single translateText call (no behavior change)", async () => {
    const { client, calls } = deeplEchoStubClient();
    const entries = Array.from({ length: 10 }, (_, i) => entry(`k${i}`, `v${i}`));
    await createDeepLProvider(config, { client }).translateBatch(request({ entries }));
    expect(calls).toHaveLength(1);
    expect(calls[0]?.texts).toHaveLength(10);
  });

  it("splits an over-cap sub-batch into multiple sequential translateText calls and merges the results", async () => {
    const { client, calls } = deeplEchoStubClient();
    const entryCount = DEEPL_MAX_TEXTS_PER_REQUEST + 5;
    const entries = Array.from({ length: entryCount }, (_, i) => entry(`k${i}`, `v${i}`));
    const result = await createDeepLProvider(config, { client }).translateBatch(
      request({ entries }),
    );

    expect(calls.length).toBeGreaterThan(1);
    for (const call of calls) {
      expect(call.texts.length).toBeLessThanOrEqual(DEEPL_MAX_TEXTS_PER_REQUEST);
    }
    expect(calls.flatMap((call) => call.texts)).toEqual(entries.map((e) => e.value));

    for (const e of entries) {
      expect(result.values.get(e.key)).toBe(`${e.value}!`);
    }
  });
});

describe("createDeepLProvider: reviewFlags", () => {
  it("produces no map entry for a clean key", async () => {
    const { client } = deeplStubClient(deeplResult(["Hallo dort"]));
    const result = (await createDeepLProvider(config, { client }).translateBatch(
      request({ entries: [entry("greeting", "Hi there")] }),
    )) as DeepLTranslateResult;
    expect(result.reviewFlags?.has("greeting")).toBe(false);
  });

  it("flags a key that equals its source", async () => {
    const { client } = deeplStubClient(deeplResult(["Hello, colleague"]));
    const result = (await createDeepLProvider(config, { client }).translateBatch(
      request({ entries: [entry("greeting", "Hello, colleague")] }),
    )) as DeepLTranslateResult;
    expect(result.reviewFlags?.get("greeting")?.reasons).toEqual(["EQUALS_SOURCE"]);
  });

  it("applies PROVIDER_DEGRADED to every accepted key of a degraded batch", async () => {
    const { client } = deeplStubClient(deeplResult(["x", "y"]));
    const result = (await createDeepLProvider(config, { client, freeAccount: true }).translateBatch(
      request({ tone: "formal", entries: [entry("a", "v1"), entry("b", "v2")] }),
    )) as DeepLTranslateResult;
    expect(result.reviewFlags?.get("a")?.reasons).toEqual(["PROVIDER_DEGRADED"]);
    expect(result.reviewFlags?.get("b")?.reasons).toEqual(["PROVIDER_DEGRADED"]);
  });

  it("appends PROVIDER_DEGRADED alongside an already-computed reason", async () => {
    const { client } = deeplStubClient(deeplResult(["v1"]));
    const result = (await createDeepLProvider(config, { client, freeAccount: true }).translateBatch(
      request({ tone: "formal", entries: [entry("a", "v1")] }),
    )) as DeepLTranslateResult;
    expect(result.reviewFlags?.get("a")?.reasons).toEqual(["EQUALS_SOURCE", "PROVIDER_DEGRADED"]);
  });

  it("applies no PROVIDER_DEGRADED reason on a non-degraded batch", async () => {
    const { client } = deeplStubClient(deeplResult(["Hallo"]));
    const result = (await createDeepLProvider(config, { client }).translateBatch(
      request({ entries: [entry("greeting", "Hello, colleague")] }),
    )) as DeepLTranslateResult;
    expect(result.reviewFlags?.get("greeting")?.reasons ?? []).not.toContain("PROVIDER_DEGRADED");
  });
});

describe("createDeepLProvider: registry", () => {
  it("resolves under id deepl without disturbing an existing provider", () => {
    const { client } = deeplStubClient(deeplResult([]));
    const deeplProvider = createDeepLProvider(config, { client });
    const registry = new ProviderRegistry();
    registry.register({ ...deeplProvider, id: "openai" }).register(deeplProvider);
    expect(registry.resolve("openai").status).toBe("resolved");
    const resolved = registry.resolve("deepl");
    expect(resolved.status).toBe("resolved");
    if (resolved.status === "resolved") {
      expect(resolved.provider.kind).toBe("machine-translation");
    }
  });
});
