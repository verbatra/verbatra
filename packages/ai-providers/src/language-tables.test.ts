import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { DEEPL_LANGUAGE_TABLE } from "./deepl/languages.js";
import { GOOGLE_TRANSLATE_LANGUAGE_TABLE } from "./google-translate/languages.js";
import { LLM_WELL_TESTED_LANGUAGES, llmLanguageSupport } from "./llm/well-tested-languages.js";
import type { ProviderLanguageTable } from "./provider.js";

const FINGERPRINTS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  deepl: {
    "2026-09-28": "1d4a43a5daa67a176802997cf1c0aee39ee662f6b4f3f7489cf3058d8880bd9d",
  },
  "google-translate": {
    "2026-09-28": "8340f26b9a59e9111e7e4afd5560d755ce9d0b756749fb73c7e48df47fb2e896",
  },
};

const TABLES: ReadonlyArray<readonly [string, ProviderLanguageTable]> = [
  ["deepl", DEEPL_LANGUAGE_TABLE],
  ["google-translate", GOOGLE_TRANSLATE_LANGUAGE_TABLE],
];

function fingerprint(table: ProviderLanguageTable): string {
  return createHash("sha256").update(JSON.stringify(table.languages)).digest("hex");
}

describe.each(TABLES)("the static %s language table", (provider, table) => {
  it("matches the documented list it was transcribed from", async () => {
    await expect(`${JSON.stringify(table, null, 2)}\n`).toMatchFileSnapshot(
      `./__snapshots__/${provider}-languages.snap`,
    );
  });

  it("carries a new version whenever its languages change", () => {
    expect(FINGERPRINTS[provider]?.[table.version]).toBe(fingerprint(table));
  });

  it("is a static table dated as an ISO day with its documentation sources", () => {
    expect(table.origin).toBe("static");
    expect(table.version).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(table.documentation.length).toBeGreaterThan(0);
  });

  it("lists every code once", () => {
    const codes = table.languages.map((language) => language.code.toLowerCase());
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("the DeepL language table", () => {
  const byCode = new Map(DEEPL_LANGUAGE_TABLE.languages.map((entry) => [entry.code, entry]));

  it("keeps the bare EN and PT codes as source languages only", () => {
    expect(byCode.get("EN")).toMatchObject({ source: true, target: false });
    expect(byCode.get("PT")).toMatchObject({ source: true, target: false });
  });

  it("keeps the regional variants as target languages only", () => {
    for (const code of ["EN-GB", "EN-US", "PT-BR", "ZH-HANT", "ES-419", "DE-CH", "FR-CA"]) {
      expect(byCode.get(code)).toMatchObject({ source: false, target: true });
    }
  });

  it("offers glossaries for 32 base languages", () => {
    const glossaryBases = DEEPL_LANGUAGE_TABLE.languages.filter(
      (entry) => entry.glossary && entry.source,
    );
    expect(glossaryBases).toHaveLength(32);
  });
});

describe("the LLM well-tested language list", () => {
  it("holds lowercase base language subtags only", () => {
    for (const language of LLM_WELL_TESTED_LANGUAGES) {
      expect(language).toMatch(/^[a-z]{2,3}$/);
    }
    expect(llmLanguageSupport.wellTestedLanguages).toBe(LLM_WELL_TESTED_LANGUAGES);
  });

  it("sends every locale unchanged", () => {
    expect(llmLanguageSupport.toSourceCode("en-US")).toBe("en-US");
    expect(llmLanguageSupport.toTargetCode("zh-Hant")).toBe("zh-Hant");
  });
});
