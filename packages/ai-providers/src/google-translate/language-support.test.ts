import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProviderError } from "../errors.js";
import type { FetchLike } from "../network/guarded-fetch.js";
import {
  googleTranslateLanguageSupport,
  parseGoogleTranslateLanguages,
} from "./language-support.js";
import { GOOGLE_TRANSLATE_LANGUAGE_TABLE } from "./languages.js";

const KEY_VAR = "GOOGLE_TRANSLATE_API_KEY";
const KEY = `AIza${"b".repeat(35)}`;
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

function fetchLive() {
  const fetchLiveTable = googleTranslateLanguageSupport.fetchLive;
  if (fetchLiveTable === undefined) {
    throw new Error("expected a live fetch");
  }
  return fetchLiveTable;
}

describe("googleTranslateLanguageSupport", () => {
  it("judges against the static table with Google's own code normalization", () => {
    expect(googleTranslateLanguageSupport.table).toBe(GOOGLE_TRANSLATE_LANGUAGE_TABLE);
    expect(googleTranslateLanguageSupport.toTargetCode("zh-Hant")).toBe("zh-TW");
    expect(googleTranslateLanguageSupport.toSourceCode("nb")).toBe("no");
  });

  it("reads the v2 language list and never puts the key in the table", async () => {
    process.env[KEY_VAR] = KEY;
    const send = vi.fn<FetchLike>(async () =>
      Response.json({ data: { languages: [{ language: "de" }, { language: "zh-TW" }] } }),
    );
    vi.stubGlobal("fetch", send);

    const live = await fetchLive()({});

    const url = String(send.mock.calls[0]?.[0]);
    expect(url).toBe(
      `https://translation.googleapis.com/language/translate/v2/languages?key=${KEY}`,
    );
    expect(JSON.stringify(live)).not.toContain(KEY);
    expect(live.languages).toEqual([
      { code: "de", source: true, target: true, glossary: false, formality: false },
      { code: "zh-TW", source: true, target: true, glossary: false, formality: false },
    ]);
  });

  it("never names the key in a failure", async () => {
    process.env[KEY_VAR] = KEY;
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 403 }));

    const error = await fetchLive()({}).catch((reason: unknown) => reason);

    expect(error).toBeInstanceOf(ProviderError);
    expect((error as ProviderError).code).toBe("AUTH_FAILED");
    expect((error as ProviderError).message).not.toContain(KEY);
  });
});

describe("parseGoogleTranslateLanguages", () => {
  it("refuses a body that is not a v2 language list", () => {
    expect(() => parseGoogleTranslateLanguages([])).toThrow(ProviderError);
  });
});
