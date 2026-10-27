import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "../errors.js";
import type { FetchLike } from "../network/guarded-fetch.js";
import { deepLLanguageSupport, parseDeepLLanguages } from "./language-support.js";
import { DEEPL_LANGUAGE_TABLE } from "./languages.js";

const KEY_VAR = "DEEPL_API_KEY";
let saved: string | undefined;

beforeEach(() => {
  saved = process.env[KEY_VAR];
});

afterEach(() => {
  if (saved === undefined) {
    delete process.env[KEY_VAR];
  } else {
    process.env[KEY_VAR] = saved;
  }
  vi.unstubAllGlobals();
});

const v3Body = [
  {
    lang: "de",
    name: "German",
    usable_as_source: true,
    usable_as_target: true,
    features: { formality: { status: "stable" }, glossary: { status: "stable" } },
  },
  { lang: "en", name: "English", usable_as_source: true, usable_as_target: false },
];

function fetchLive() {
  const fetchLiveTable = deepLLanguageSupport.fetchLive;
  if (fetchLiveTable === undefined) {
    throw new Error("expected a live fetch");
  }
  return fetchLiveTable;
}

describe("deepLLanguageSupport", () => {
  it("judges against the static table with DeepL's own code normalization", () => {
    expect(deepLLanguageSupport.coverage).toBe("listed");
    expect(deepLLanguageSupport.table).toBe(DEEPL_LANGUAGE_TABLE);
    expect(deepLLanguageSupport.toSourceCode("en-US")).toBe("EN");
    expect(deepLLanguageSupport.toTargetCode("pt-BR")).toBe("PT-BR");
  });

  it("reads the v3 language list of the pro endpoint with the key in the auth header", async () => {
    process.env[KEY_VAR] = "pro-key-value";
    const send = vi.fn<FetchLike>(async () => Response.json(v3Body));
    vi.stubGlobal("fetch", send);

    const live = await fetchLive()({});

    const [url, init] = send.mock.calls[0] ?? [];
    expect(url).toBe("https://api.deepl.com/v3/languages?resource=translate_text");
    expect(init?.headers).toEqual({ authorization: "DeepL-Auth-Key pro-key-value" });
    expect(live.origin).toBe("live");
    expect(live.documentation).toEqual([url]);
    expect(live.languages).toEqual([
      { code: "de", source: true, target: true, glossary: true, formality: true },
      { code: "en", source: true, target: false, glossary: false, formality: false },
    ]);
  });

  it("uses the free endpoint for a free-tier key", async () => {
    process.env[KEY_VAR] = "free-key-value:fx";
    const send = vi.fn<FetchLike>(async () => Response.json(v3Body));
    vi.stubGlobal("fetch", send);

    await fetchLive()({});

    expect(send.mock.calls[0]?.[0]).toBe(
      "https://api-free.deepl.com/v3/languages?resource=translate_text",
    );
  });

  it("refuses to send the request when the network policy forbids the DeepL host", async () => {
    process.env[KEY_VAR] = "pro-key-value";
    const send = vi.fn<FetchLike>(async () => Response.json(v3Body));
    const network = {
      policy: {
        rules: [{ source: "config" as const, policy: "local-only" as const, allowedHosts: [] }],
      },
      env: { [KEY_VAR]: "pro-key-value" },
      deps: { fetch: send },
    };

    await expect(fetchLive()({ network })).rejects.toMatchObject({
      code: "NETWORK_POLICY_VIOLATION",
    });
    expect(send).not.toHaveBeenCalled();
  });

  it("fails with MISSING_API_KEY before any request when the key is not set", async () => {
    delete process.env[KEY_VAR];
    const send = vi.fn<FetchLike>();
    vi.stubGlobal("fetch", send);

    await expect(fetchLive()({})).rejects.toMatchObject({ code: "MISSING_API_KEY" });
    expect(send).not.toHaveBeenCalled();
  });
});

describe("parseDeepLLanguages", () => {
  it("refuses a body that is not a v3 language list", () => {
    expect(() => parseDeepLLanguages({ languages: [] }, "https://api.deepl.com")).toThrow(
      ProviderError,
    );
  });
});
