import { describe, expect, it } from "vitest";
import type { FetchLike } from "../network/guarded-fetch.js";
import { libreTranslateLanguageSupport, parseLibreTranslateLanguages } from "./language-support.js";
import { LIBRETRANSLATE_LANGUAGE_TABLE } from "./languages.js";

const SERVER_LIST = [
  { code: "en", name: "English", targets: ["de", "en", "pt-BR"] },
  { code: "de", name: "German", targets: ["de", "en"] },
  { code: "ga", name: "Irish", targets: [] },
];

describe("the static LibreTranslate language table", () => {
  it("lists no language and is partial, since installed models differ per server", () => {
    expect(LIBRETRANSLATE_LANGUAGE_TABLE.languages).toEqual([]);
    expect(LIBRETRANSLATE_LANGUAGE_TABLE.partial).toBe(true);
    expect(LIBRETRANSLATE_LANGUAGE_TABLE.origin).toBe("static");
    expect(LIBRETRANSLATE_LANGUAGE_TABLE.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("parseLibreTranslateLanguages", () => {
  it("lists every language as a source and a language as a target when any source offers it", () => {
    const table = parseLibreTranslateLanguages(SERVER_LIST);
    expect(table.origin).toBe("live");
    expect(table.partial).toBeUndefined();
    expect(table.languages).toEqual([
      { code: "en", source: true, target: true, glossary: false, formality: false },
      { code: "de", source: true, target: true, glossary: false, formality: false },
      { code: "ga", source: true, target: false, glossary: false, formality: false },
    ]);
  });

  it("accepts an entry without targets", () => {
    expect(parseLibreTranslateLanguages([{ code: "en" }]).languages[0]?.target).toBe(false);
  });

  it("fails INVALID_RESPONSE for a body that is not a language list", () => {
    expect(() => parseLibreTranslateLanguages({ error: "x" })).toThrow(
      expect.objectContaining({ code: "INVALID_RESPONSE" }),
    );
  });
});

describe("libreTranslateLanguageSupport", () => {
  it("fetches the live list from the configured server's languages endpoint", async () => {
    const urls: string[] = [];
    const fetch: FetchLike = async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify(SERVER_LIST), { status: 200 });
    };
    const support = libreTranslateLanguageSupport("http://localhost:5000/", fetch);

    const table = await support.fetchLive?.({});

    expect(urls).toEqual(["http://localhost:5000/languages"]);
    expect(table?.languages.map((language) => language.code)).toEqual(["en", "de", "ga"]);
    expect(support.toTargetCode("de-AT")).toBe("de");
    expect(support.toSourceCode("zh-TW")).toBe("zh-Hant");
  });
});
