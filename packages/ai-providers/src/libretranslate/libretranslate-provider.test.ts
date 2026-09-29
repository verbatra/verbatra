import { describe, expect, it } from "vitest";
import type { TranslateRequest } from "../provider.js";
import { entry, regexExtractor, termGlossary } from "../test-support.js";
import { createLibreTranslateProvider } from "./libretranslate-provider.js";
import { PLACEHOLDER_UNSUPPORTED_MESSAGE } from "./notices.js";
import type { LibreTranslateClient, LibreTranslateHttpResponse } from "./types.js";

const config = { baseUrl: "http://localhost:5000" };

interface SentCall {
  readonly texts: readonly string[];
  readonly sourceLang: string;
  readonly targetLang: string;
}

function stubClient(respond: (texts: readonly string[]) => LibreTranslateHttpResponse): {
  client: LibreTranslateClient;
  calls: SentCall[];
} {
  const calls: SentCall[] = [];
  const client: LibreTranslateClient = {
    translate: async (texts, sourceLang, targetLang) => {
      calls.push({ texts, sourceLang, targetLang });
      return respond(texts);
    },
  };
  return { client, calls };
}

function echo(transform: (text: string) => string = (text) => `DE:${text}`) {
  return stubClient((texts) => ({
    status: 200,
    body: { translatedText: texts.map(transform) },
  }));
}

function request(overrides: Partial<TranslateRequest> = {}): TranslateRequest {
  return {
    sourceLocale: "en-US",
    targetLocale: "de-AT",
    entries: [entry("save", "Save")],
    extractPlaceholders: regexExtractor,
    ...overrides,
  };
}

describe("createLibreTranslateProvider: identity", () => {
  it("is a machine-translation provider without glossary support", () => {
    const provider = createLibreTranslateProvider(config, { client: echo().client });
    expect(provider.id).toBe("libretranslate");
    expect(provider.kind).toBe("machine-translation");
    expect(provider.supportsGlossary).toBe(false);
  });

  it("builds its own HTTP client without requiring an API key", () => {
    expect(createLibreTranslateProvider(config).id).toBe("libretranslate");
  });

  it("rejects a config without a valid baseUrl", () => {
    expect(() => createLibreTranslateProvider({ baseUrl: "nope" })).toThrow();
  });
});

describe("createLibreTranslateProvider: translation", () => {
  it("sends one batch in base language codes and returns values by key", async () => {
    const { client, calls } = echo();
    const result = await createLibreTranslateProvider(config, { client }).translateBatch(
      request({ entries: [entry("a", "Save"), entry("b", "Cancel")] }),
    );
    expect(calls).toEqual([{ texts: ["Save", "Cancel"], sourceLang: "en", targetLang: "de" }]);
    expect(result.values.get("a")).toBe("DE:Save");
    expect(result.values.get("b")).toBe("DE:Cancel");
    expect(result.integrity.get("a")?.matches).toBe(true);
    expect(result.usage).toBeUndefined();
    expect(result.notices).toEqual([]);
  });

  it("applies a localeMap entry instead of the built-in normalization", async () => {
    const { client, calls } = echo();
    await createLibreTranslateProvider(
      { ...config, localeMap: { "de-AT": "de-custom" } },
      { client },
    ).translateBatch(request());
    expect(calls[0]?.targetLang).toBe("de-custom");
  });

  it("masks placeholders as numbered markers and restores them after translation", async () => {
    const { client, calls } = stubClient(() => ({
      status: 200,
      body: { translatedText: ["{1} Nachrichten für {0}"] },
    }));
    const result = await createLibreTranslateProvider(config, { client }).translateBatch(
      request({
        entries: [entry("inbox", "{{count}} messages for {name}", ["{{count}}", "{name}"])],
      }),
    );
    expect(calls[0]?.texts).toEqual(["{0} messages for {1}"]);
    expect(result.values.get("inbox")).toBe("{name} Nachrichten für {{count}}");
    expect(result.integrity.get("inbox")?.matches).toBe(true);
    expect(result.notices).toEqual([]);
  });

  it("withholds an ICU value it cannot mask, never sending it", async () => {
    const { client, calls } = echo();
    const result = await createLibreTranslateProvider(config, { client }).translateBatch(
      request({
        entries: [
          entry("files", "{n, plural, one {# file} other {# files}}", ["{n}"]),
          entry("save", "Save"),
        ],
      }),
    );
    expect(calls[0]?.texts).toEqual(["Save"]);
    expect(result.values.has("files")).toBe(false);
    expect(result.notices).toEqual([
      { code: "PLACEHOLDER_UNSUPPORTED", message: PLACEHOLDER_UNSUPPORTED_MESSAGE },
    ]);
  });

  it("withholds a value whose markers the engine mangled", async () => {
    const { client } = stubClient(() => ({
      status: 200,
      body: { translatedText: ["Hallo, willkommen!"] },
    }));
    const result = await createLibreTranslateProvider(config, { client }).translateBatch(
      request({ entries: [entry("hi", "Hello {name}, welcome!", ["{name}"])] }),
    );
    expect(result.values.size).toBe(0);
    expect(result.integrity.size).toBe(0);
    expect(result.notices?.map((notice) => notice.code)).toEqual(["PLACEHOLDER_UNSUPPORTED"]);
  });

  it("sends nothing when every entry is withheld", async () => {
    const { client, calls } = echo();
    const result = await createLibreTranslateProvider(config, { client }).translateBatch(
      request({ entries: [entry("n", "{n, number}", ["{n}"])] }),
    );
    expect(calls).toEqual([]);
    expect(result.values.size).toBe(0);
  });

  it("reports the tone and glossary it cannot apply as notices", async () => {
    const { client } = echo();
    const result = await createLibreTranslateProvider(config, { client }).translateBatch(
      request({ tone: "formal", glossary: termGlossary({ Save: "Speichern" }) }),
    );
    expect(result.notices?.map((notice) => notice.code)).toEqual([
      "FORMALITY_DOWNGRADED",
      "GLOSSARY_IGNORED",
    ]);
    expect(result.reviewFlags?.get("save")?.reasons).toContain("PROVIDER_DEGRADED");
  });
});

describe("createLibreTranslateProvider: failures", () => {
  it("maps an HTTP error to a structured ProviderError", async () => {
    const { client } = stubClient(() => ({ status: 400, body: { error: "de is not supported" } }));
    await expect(
      createLibreTranslateProvider(config, { client }).translateBatch(request()),
    ).rejects.toMatchObject({ name: "ProviderError", code: "INVALID_REQUEST" });
  });

  it("reports a missing key only when the server demands one and none is configured", async () => {
    const { client } = stubClient(() => ({
      status: 400,
      body: { error: "Please contact the server operator to get an API key" },
    }));
    await expect(
      createLibreTranslateProvider(config, { client }).translateBatch(request()),
    ).rejects.toMatchObject({ code: "MISSING_API_KEY", envVar: "LIBRETRANSLATE_API_KEY" });
    await expect(
      createLibreTranslateProvider(config, { client, keyConfigured: true }).translateBatch(
        request(),
      ),
    ).rejects.toMatchObject({ code: "AUTH_FAILED" });
  });

  it("fails INVALID_RESPONSE when the server returns the wrong number of texts", async () => {
    const { client } = stubClient(() => ({ status: 200, body: { translatedText: [] } }));
    await expect(
      createLibreTranslateProvider(config, { client }).translateBatch(request()),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
  });

  it("wraps a transport failure as a ProviderError naming only the endpoint host", async () => {
    const client: LibreTranslateClient = {
      translate: async () => {
        throw new TypeError("fetch failed");
      },
    };
    const error = await createLibreTranslateProvider(
      { baseUrl: "http://user:secret@localhost:5000/api" },
      { client },
    )
      .translateBatch(request())
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({ name: "ProviderError" });
    expect(String((error as Error).message)).toContain("localhost:5000");
    expect(String((error as Error).message)).not.toContain("secret");
  });

  it("times out after requestTimeoutMs with TIMEOUT", async () => {
    const client: LibreTranslateClient = {
      translate: (_texts, _source, _target, signal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason));
        }),
    };
    await expect(
      createLibreTranslateProvider({ ...config, requestTimeoutMs: 5 }, { client }).translateBatch(
        request(),
      ),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
  });

  it("rejects a malformed request before sending", async () => {
    const { client, calls } = echo();
    await expect(
      createLibreTranslateProvider(config, { client }).translateBatch(request({ entries: [] })),
    ).rejects.toMatchObject({ code: "INVALID_REQUEST" });
    expect(calls).toEqual([]);
  });
});
