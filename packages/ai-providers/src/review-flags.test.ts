import type { PlaceholderIntegrityResult } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import type { ProviderNotice, ReviewFlag } from "./provider.js";
import {
  applyProviderDegraded,
  buildEntryReviewFlags,
  computeReviewFlags,
  latinEquivalentLength,
  type ReviewFlagInput,
} from "./review-flags.js";
import { entry } from "./test-support.js";

const CLEAN_INTEGRITY: PlaceholderIntegrityResult = {
  matches: true,
  missing: [],
  extra: [],
  reordered: false,
};

function input(overrides: Partial<ReviewFlagInput> = {}): ReviewFlagInput {
  return {
    sourceValue: "Hello there, friend",
    translatedValue: "Hallo dort, Freund",
    sourceLocale: "en",
    targetLocale: "de",
    integrity: CLEAN_INTEGRITY,
    ...overrides,
  };
}

describe("computeReviewFlags: clean input", () => {
  it("returns undefined (an implicit ok) when nothing applies", () => {
    expect(computeReviewFlags(input())).toBeUndefined();
  });
});

describe("computeReviewFlags: LENGTH_RATIO_OUTLIER", () => {
  it("is skipped when the trimmed source is under 12 grapheme clusters", () => {
    const flag = computeReviewFlags(input({ sourceValue: "short sourc", translatedValue: "x" }));
    expect(flag).toBeUndefined();
  });

  it("does not flag a ratio just inside the lower bound (0.35)", () => {
    const source = "12345678901234567890";
    const translated = "1234567";
    expect(translated.length / source.length).toBeCloseTo(0.35, 5);
    expect(
      computeReviewFlags(input({ sourceValue: source, translatedValue: translated })),
    ).toBeUndefined();
  });

  it("flags a ratio just outside the lower bound", () => {
    const source = "12345678901234567890";
    const translated = "123456";
    expect(translated.length / source.length).toBeLessThan(0.35);
    const flag = computeReviewFlags(input({ sourceValue: source, translatedValue: translated }));
    expect(flag?.reasons).toEqual(["LENGTH_RATIO_OUTLIER"]);
  });

  it("does not flag a ratio just inside the upper bound (3.0)", () => {
    const source = "1234567890123";
    const translated = "1".repeat(39);
    expect(translated.length / source.length).toBeCloseTo(3.0, 5);
    expect(
      computeReviewFlags(input({ sourceValue: source, translatedValue: translated })),
    ).toBeUndefined();
  });

  it("flags a ratio just outside the upper bound", () => {
    const source = "1234567890123";
    const translated = "1".repeat(40);
    expect(translated.length / source.length).toBeGreaterThan(3.0);
    const flag = computeReviewFlags(input({ sourceValue: source, translatedValue: translated }));
    expect(flag?.reasons).toEqual(["LENGTH_RATIO_OUTLIER"]);
  });
});

describe("latinEquivalentLength", () => {
  it.each([
    ["Latin", "abc", 3],
    ["Han", "保存", 7],
    ["Hiragana and Katakana", "さんファ", 6],
    ["Hangul", "저장", 4],
    ["Cyrillic", "абв", 3],
    ["ideographic punctuation", "。、", 2],
    ["astral Han", "\u{20000}", 3.5],
  ])("weighs %s graphemes by their own script", (_script, value, expected) => {
    expect(latinEquivalentLength(value)).toBe(expected);
  });
});

describe("computeReviewFlags: LENGTH_RATIO_OUTLIER grapheme counting", () => {
  it("counts an emoji with a skin-tone modifier as one character", () => {
    const translated = "\u{1F44D}\u{1F3FD}".repeat(39);
    expect(translated.length).toBeGreaterThan(39 * 3);
    expect(
      computeReviewFlags(input({ sourceValue: "1234567890123", translatedValue: translated })),
    ).toBeUndefined();
  });

  it("counts an astral-plane character as one character", () => {
    const translated = "\u{10330}".repeat(6);
    expect(translated.length).toBe(12);
    const flag = computeReviewFlags(
      input({ sourceValue: "12345678901234567890", translatedValue: translated }),
    );
    expect(flag?.reasons).toEqual(["LENGTH_RATIO_OUTLIER"]);
  });

  it("counts a base letter with a combining mark as one character", () => {
    const translated = "e\u0301".repeat(39);
    expect(translated.length).toBe(78);
    expect(
      computeReviewFlags(input({ sourceValue: "1234567890123", translatedValue: translated })),
    ).toBeUndefined();
  });

  it("does not open the ratio on a source of 12 code units but fewer graphemes", () => {
    const flag = computeReviewFlags(
      input({ sourceValue: "e\u0301".repeat(6), translatedValue: "x" }),
    );
    expect(flag).toBeUndefined();
  });
});

const SAVED = "Your changes have been saved successfully.";
const SHARED = "{userName} shared {count} files";
const DOCS_LINK = "See https://example.com/docs/getting-started for details";
const DELETE_PROJECT =
  "Are you sure you want to delete this project? This action cannot be undone.";
const CONNECTION = "Please check your internet connection and try again.";
const UPLOAD = "Upload failed because the file is too large.";
const SETTINGS = "Account settings and privacy preferences";

const CORRECT_CJK_PAIRS: readonly (readonly [string, string, string])[] = [
  ["zh", SAVED, "变更已成功保存。"],
  ["ja", SAVED, "変更が正常に保存されました。"],
  ["ko", SAVED, "변경 사항이 성공적으로 저장되었습니다."],
  ["zh", SHARED, "{userName} 共享了 {count} 个文件"],
  ["ja", SHARED, "{userName} さんが {count} 件のファイルを共有しました"],
  ["ko", SHARED, "{userName}님이 파일 {count}개를 공유했습니다"],
  ["zh", DOCS_LINK, "详情请参阅 https://example.com/docs/getting-started"],
  ["ja", DOCS_LINK, "詳細は https://example.com/docs/getting-started を参照してください"],
  ["ko", DOCS_LINK, "자세한 내용은 https://example.com/docs/getting-started 를 참조하세요"],
  ["zh", DELETE_PROJECT, "确定要删除此项目吗？此操作无法撤消。"],
  ["ja", DELETE_PROJECT, "このプロジェクトを削除してもよろしいですか？この操作は元に戻せません。"],
  ["ko", DELETE_PROJECT, "이 프로젝트를 삭제하시겠습니까? 이 작업은 취소할 수 없습니다."],
  ["zh", CONNECTION, "请检查您的网络连接，然后重试。"],
  ["ja", CONNECTION, "インターネット接続を確認して、もう一度お試しください。"],
  ["ko", CONNECTION, "인터넷 연결을 확인한 후 다시 시도하세요."],
  ["zh", UPLOAD, "文件过大，上传失败。"],
  ["ja", UPLOAD, "ファイルが大きすぎるため、アップロードに失敗しました。"],
  ["ko", UPLOAD, "파일이 너무 커서 업로드에 실패했습니다."],
  ["zh", SETTINGS, "账户设置和隐私偏好"],
  ["ja", SETTINGS, "アカウント設定とプライバシー設定"],
  ["ko", SETTINGS, "계정 설정 및 개인정보 환경설정"],
  ["ja", "Annual financial statement required", "年次財務諸表が必要です"],
];

const TRUNCATED_CJK_PAIRS: readonly (readonly [string, string, string])[] = [
  ["zh", SAVED, "变更"],
  ["ja", SAVED, "変更が"],
  ["ko", SAVED, "변경"],
  ["zh", DELETE_PROJECT, "确定要删除"],
  ["ja", DELETE_PROJECT, "このプロジェクト"],
  ["ko", DELETE_PROJECT, "이 프로젝트를"],
];

const OVERLONG_CJK_PAIRS: readonly (readonly [string, string, string])[] = [
  ["zh", "Save your changes", "保存您的更改".repeat(5)],
  ["ja", "Save your changes", "変更を保存してください。".repeat(3)],
  ["ko", "Save your changes", "변경 사항을 저장하세요. ".repeat(4)],
];

const LOWER_BOUND = 0.35;
const UPPER_BOUND = 3.0;
const MARGIN = 1.5;

describe("computeReviewFlags: LENGTH_RATIO_OUTLIER across scripts", () => {
  it.each(CORRECT_CJK_PAIRS)(
    "does not flag a correct en to %s translation of %j",
    (targetLocale, sourceValue, translatedValue) => {
      expect(
        computeReviewFlags(input({ sourceValue, translatedValue, targetLocale })),
      ).toBeUndefined();
    },
  );

  it.each(CORRECT_CJK_PAIRS)(
    "keeps a correct en to %s ratio at least 1.5x inside both bounds for %j",
    (_targetLocale, sourceValue, translatedValue) => {
      const ratio = latinEquivalentLength(translatedValue) / latinEquivalentLength(sourceValue);
      expect(ratio).toBeGreaterThan(LOWER_BOUND * MARGIN);
      expect(ratio).toBeLessThan(UPPER_BOUND / MARGIN);
    },
  );

  it.each(CORRECT_CJK_PAIRS)(
    "does not flag the reverse %s to en direction of %j",
    (sourceLocale, englishValue, cjkValue) => {
      expect(
        computeReviewFlags(
          input({
            sourceValue: cjkValue,
            translatedValue: englishValue,
            sourceLocale,
            targetLocale: "en",
          }),
        ),
      ).toBeUndefined();
    },
  );

  it.each(TRUNCATED_CJK_PAIRS)(
    "still flags a truncated en to %s translation of %j",
    (targetLocale, sourceValue, translatedValue) => {
      const flag = computeReviewFlags(input({ sourceValue, translatedValue, targetLocale }));
      expect(flag?.reasons).toEqual(["LENGTH_RATIO_OUTLIER"]);
    },
  );

  it.each(OVERLONG_CJK_PAIRS)(
    "still flags an en to %s translation far longer than %j",
    (targetLocale, sourceValue, translatedValue) => {
      const flag = computeReviewFlags(input({ sourceValue, translatedValue, targetLocale }));
      expect(flag?.reasons).toEqual(["LENGTH_RATIO_OUTLIER"]);
    },
  );

  it("still flags a truncated ja to en translation", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "変更が正常に保存されました。",
        translatedValue: "Saved",
        sourceLocale: "ja",
        targetLocale: "en",
      }),
    );
    expect(flag?.reasons).toEqual(["LENGTH_RATIO_OUTLIER"]);
  });

  it("skips a Han source too short for the ratio once weighted to Latin length", () => {
    const flag = computeReviewFlags(
      input({ sourceValue: "保存", translatedValue: "x", sourceLocale: "zh", targetLocale: "en" }),
    );
    expect(flag).toBeUndefined();
  });

  it("weighs by the text's own script, not the locale tag", () => {
    expect(
      computeReviewFlags(
        input({ sourceValue: SAVED, translatedValue: "变更已成功保存。", targetLocale: "en" }),
      ),
    ).toBeUndefined();
  });

  it.each([
    ["sr-Latn", "Vaše izmene su uspešno sačuvane."],
    ["sr-Cyrl", "Ваше измене су успешно сачуване."],
  ])("treats en to %s like Latin text", (targetLocale, translatedValue) => {
    expect(
      computeReviewFlags(input({ sourceValue: SAVED, translatedValue, targetLocale })),
    ).toBeUndefined();
    const flag = computeReviewFlags(
      input({ sourceValue: SAVED, translatedValue: translatedValue.slice(0, 5), targetLocale }),
    );
    expect(flag?.reasons).toEqual(["LENGTH_RATIO_OUTLIER"]);
  });
});

describe("computeReviewFlags: EQUALS_SOURCE", () => {
  it("flags an exact match in a different locale with a letter present", () => {
    const flag = computeReviewFlags(
      input({ sourceValue: "Hello there, friend", translatedValue: "Hello there, friend" }),
    );
    expect(flag?.reasons).toEqual(["EQUALS_SOURCE"]);
  });

  it("does not flag on a one-character difference", () => {
    const flag = computeReviewFlags(
      input({ sourceValue: "Hello there, friend", translatedValue: "Hello there, friend!" }),
    );
    expect(flag).toBeUndefined();
  });

  it("does not flag when the source and target locale are the same", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "Hello there, friend",
        translatedValue: "Hello there, friend",
        sourceLocale: "en",
        targetLocale: "en",
      }),
    );
    expect(flag).toBeUndefined();
  });

  it("does not flag a placeholder-only source with no letters (a numbered token)", () => {
    const flag = computeReviewFlags(input({ sourceValue: "{0}", translatedValue: "{0}" }));
    expect(flag).toBeUndefined();
  });

  it("does not flag a numeric-only source", () => {
    const flag = computeReviewFlags(input({ sourceValue: "12345", translatedValue: "12345" }));
    expect(flag).toBeUndefined();
  });

  it("does not flag a punctuation-only source", () => {
    const flag = computeReviewFlags(input({ sourceValue: "!!! ---", translatedValue: "!!! ---" }));
    expect(flag).toBeUndefined();
  });

  it("compares trimmed values, ignoring surrounding whitespace", () => {
    const flag = computeReviewFlags(
      input({ sourceValue: "  Hello there, friend  ", translatedValue: "Hello there, friend" }),
    );
    expect(flag?.reasons).toEqual(["EQUALS_SOURCE"]);
  });
});

describe("computeReviewFlags: GLOSSARY_TERM_MISSED", () => {
  it("is not evaluated when no glossary is supplied", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "Click Save to continue",
        translatedValue: "Klicken Sie zum Fortfahren",
      }),
    );
    expect(flag).toBeUndefined();
  });

  it("is not evaluated for an empty glossary", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "Click Save to continue",
        translatedValue: "Klicken Sie zum Fortfahren",
        glossary: {},
      }),
    );
    expect(flag).toBeUndefined();
  });

  it("flags when a matched source term's target term is missing from the translation", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "Click Save to continue",
        translatedValue: "Klicken Sie zum Fortfahren",
        glossary: { Save: "Speichern" },
      }),
    );
    expect(flag?.reasons).toEqual(["GLOSSARY_TERM_MISSED"]);
  });

  it("does not flag when the target term is present (case-insensitive)", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "Click Save to continue",
        translatedValue: "Klicken Sie SPEICHERN zum Fortfahren",
        glossary: { save: "Speichern" },
      }),
    );
    expect(flag).toBeUndefined();
  });

  it("does not evaluate a term whose source form is absent from the source value", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "Click Continue",
        translatedValue: "Klicken Sie Weiter",
        glossary: { Save: "Speichern" },
      }),
    );
    expect(flag).toBeUndefined();
  });

  it("does not treat a source term buried inside a longer word as present", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "Airport transfers are included",
        translatedValue: "Flughafentransfers sind inklusive",
        glossary: { AI: "KI" },
      }),
    );
    expect(flag).toBeUndefined();
  });

  it("accepts a target term that only occurs inside a longer word", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "AI summary",
        translatedValue: "Kindliche Zusammenfassung",
        glossary: { AI: "KI" },
      }),
    );
    expect(flag).toBeUndefined();
  });

  it("does not treat a source term followed by a digit as present", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "AI2 is the model name",
        translatedValue: "AI2 ist der Modellname",
        glossary: { AI: "KI" },
      }),
    );
    expect(flag).toBeUndefined();
  });

  it("does not treat a source term preceded by a letter as present", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "xAI builds models",
        translatedValue: "xAI baut Modelle",
        glossary: { AI: "KI" },
      }),
    );
    expect(flag).toBeUndefined();
  });

  it("matches a term whose characters are regex metacharacters", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "Learn C++ today",
        translatedValue: "Lerne heute",
        glossary: { "C++": "C++" },
      }),
    );
    expect(flag?.reasons).toEqual(["GLOSSARY_TERM_MISSED"]);
  });

  it("does not flag a metacharacter term that is present on both sides", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "Learn .NET today",
        translatedValue: "Lerne heute .NET",
        glossary: { ".NET": ".NET" },
      }),
    );
    expect(flag).toBeUndefined();
  });

  it("falls back to containment for a source term in a script without word separators", () => {
    const flag = computeReviewFlags(
      input({
        sourceLocale: "ja",
        sourceValue: "アカウントを削除します",
        translatedValue: "Delete your account",
        glossary: { アカウント: "account" },
      }),
    );
    expect(flag).toBeUndefined();
  });

  it("finds a source term whose trailing prolonged sound mark precedes a digit", () => {
    const flag = computeReviewFlags(
      input({
        sourceLocale: "ja",
        targetLocale: "en",
        sourceValue: "サーバー1台を追加します",
        translatedValue: "Add one machine",
        glossary: { サーバー: "server" },
      }),
    );
    expect(flag?.reasons).toEqual(["GLOSSARY_TERM_MISSED"]);
  });

  it("flags a missing target term in a script without word separators", () => {
    const flag = computeReviewFlags(
      input({
        targetLocale: "ja",
        sourceValue: "Delete your account",
        translatedValue: "これを削除してください",
        glossary: { account: "アカウント" },
      }),
    );
    expect(flag?.reasons).toEqual(["GLOSSARY_TERM_MISSED"]);
  });

  it("finds a latin source term when a script without word separators follows it", () => {
    const flag = computeReviewFlags(
      input({
        sourceLocale: "ja",
        sourceValue: "AI検索を実行します",
        translatedValue: "Führe die Suche aus",
        glossary: { AI: "KI" },
      }),
    );
    expect(flag?.reasons).toEqual(["GLOSSARY_TERM_MISSED"]);
  });

  it("does not treat a source term followed by a combining mark as present", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "Order at the cafe\u0301",
        translatedValue: "Bestellen Sie dort",
        glossary: { cafe: "Kaffee" },
      }),
    );
    expect(flag).toBeUndefined();
  });

  it("accepts a target term carried by a compound that appends to it", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "Open your account",
        translatedValue: "Öffne dein Benutzerkonto",
        glossary: { account: "Konto" },
      }),
    );
    expect(flag).toBeUndefined();
  });

  it("accepts a target term carried by a compound that prepends to it", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "Open your account settings",
        translatedValue: "Öffne deine Kontoeinstellungen",
        glossary: { account: "Konto" },
      }),
    );
    expect(flag).toBeUndefined();
  });

  it("accepts a target term followed by an agglutinated particle", () => {
    const flag = computeReviewFlags(
      input({
        targetLocale: "ko",
        sourceValue: "Delete your account",
        translatedValue: "계정을 삭제합니다",
        glossary: { account: "계정" },
      }),
    );
    expect(flag).toBeUndefined();
  });

  it("accepts a target term that ends in a prolonged sound mark", () => {
    const flag = computeReviewFlags(
      input({
        targetLocale: "ja",
        sourceValue: "Add one server",
        translatedValue: "サーバー1台を追加",
        glossary: { server: "サーバー" },
      }),
    );
    expect(flag).toBeUndefined();
  });

  it("skips a glossary pair whose source or target term is empty", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "Click Save to continue",
        translatedValue: "Klicken Sie zum Fortfahren",
        glossary: { Save: "", "": "Speichern" },
      }),
    );
    expect(flag).toBeUndefined();
  });

  it("keeps scanning the source past a buried occurrence and accepts a later standalone one", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "xAI and AI both ship models",
        translatedValue: "xAI und AI liefern beide Modelle",
        glossary: { AI: "KI" },
      }),
    );
    expect(flag?.reasons).toEqual(["GLOSSARY_TERM_MISSED"]);
  });
});

describe("computeReviewFlags: INTEGRITY_REORDERED", () => {
  it("flags when matches is true and reordered is true", () => {
    const flag = computeReviewFlags(
      input({ integrity: { matches: true, missing: [], extra: [], reordered: true } }),
    );
    expect(flag?.reasons).toEqual(["INTEGRITY_REORDERED"]);
  });

  it("does not flag when matches is false, even if reordered is true", () => {
    const flag = computeReviewFlags(
      input({
        integrity: { matches: false, missing: ["{{a}}"], extra: [], reordered: true },
      }),
    );
    expect(flag).toBeUndefined();
  });

  it("does not flag when reordered is false", () => {
    const flag = computeReviewFlags(
      input({ integrity: { matches: true, missing: [], extra: [], reordered: false } }),
    );
    expect(flag).toBeUndefined();
  });
});

describe("computeReviewFlags: multi-reason key", () => {
  it("includes every reason code that applies", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "Click Save to continue",
        translatedValue: "Click Save to continue",
        glossary: { Save: "Speichern" },
        integrity: { matches: true, missing: [], extra: [], reordered: true },
      }),
    );
    expect(flag?.reasons).toEqual(
      expect.arrayContaining(["EQUALS_SOURCE", "GLOSSARY_TERM_MISSED", "INTEGRITY_REORDERED"]),
    );
    expect(flag?.reasons).toHaveLength(3);
    expect(flag?.status).toBe("review");
  });
});

describe("applyProviderDegraded", () => {
  const notice = (code: ProviderNotice["code"]): ProviderNotice => ({ code, message: "static" });

  it("is a no-op when no degradation notice is present", () => {
    const flags = new Map([
      ["a", { status: "review" as const, reasons: ["EQUALS_SOURCE" as const] }],
    ]);
    const result = applyProviderDegraded(flags, [notice("PLACEHOLDER_UNSUPPORTED")], ["a", "b"]);
    expect(result).toBe(flags);
  });

  it("creates a new flag entry for a clean accepted key when the batch is degraded", () => {
    const result = applyProviderDegraded(new Map(), [notice("FORMALITY_DOWNGRADED")], ["a"]);
    expect(result.get("a")).toEqual({ status: "review", reasons: ["PROVIDER_DEGRADED"] });
  });

  it("appends to an existing flag's reasons rather than replacing them", () => {
    const flags = new Map([
      ["a", { status: "review" as const, reasons: ["EQUALS_SOURCE" as const] }],
    ]);
    const result = applyProviderDegraded(flags, [notice("GLOSSARY_IGNORED")], ["a"]);
    expect(result.get("a")).toEqual({
      status: "review",
      reasons: ["EQUALS_SOURCE", "PROVIDER_DEGRADED"],
    });
  });

  it("only applies to the given accepted keys, never the whole map", () => {
    const result = applyProviderDegraded(new Map(), [notice("FORMALITY_DOWNGRADED")], ["a", "b"]);
    expect(result.size).toBe(2);
    expect(result.has("c")).toBe(false);
  });

  it("does not mutate the input map", () => {
    const flags = new Map<string, ReviewFlag>();
    const result = applyProviderDegraded(flags, [notice("FORMALITY_DOWNGRADED")], ["a"]);
    expect(flags.size).toBe(0);
    expect(result.size).toBe(1);
  });
});

describe("buildEntryReviewFlags", () => {
  it("returns an empty map when no entry has a translated value", () => {
    const result = buildEntryReviewFlags(
      [entry("greeting", "Hello there, friend")],
      new Map(),
      new Map(),
      "en",
      "de",
      undefined,
      undefined,
    );
    expect(result.size).toBe(0);
  });

  it("skips an entry whose integrity result is missing, even when a value is present", () => {
    const result = buildEntryReviewFlags(
      [entry("greeting", "Hello there, friend")],
      new Map([["greeting", "Hallo dort, Freund"]]),
      new Map(),
      "en",
      "de",
      undefined,
      undefined,
    );
    expect(result.size).toBe(0);
  });

  it("computes the same flag computeReviewFlags would for a translated, integrity-checked entry", () => {
    const result = buildEntryReviewFlags(
      [entry("greeting", "Hello there, friend")],
      new Map([["greeting", "Hello there, friend"]]),
      new Map([["greeting", CLEAN_INTEGRITY]]),
      "en",
      "de",
      undefined,
      undefined,
    );
    expect(result.get("greeting")?.reasons).toEqual(["EQUALS_SOURCE"]);
  });

  it("forwards the given glossary and locales to the per-entry computation", () => {
    const result = buildEntryReviewFlags(
      [entry("cta", "Click Save to continue")],
      new Map([["cta", "Klicken Sie zum Fortfahren"]]),
      new Map([["cta", CLEAN_INTEGRITY]]),
      "en",
      "de",
      { Save: "Speichern" },
      undefined,
    );
    expect(result.get("cta")?.reasons).toEqual(["GLOSSARY_TERM_MISSED"]);
  });

  it("only processes the given entries, ignoring extra keys present in values and integrity", () => {
    const result = buildEntryReviewFlags(
      [entry("a", "Hello there, friend")],
      new Map([
        ["a", "Hello there, friend"],
        ["b", "Hello there, friend"],
      ]),
      new Map([
        ["a", CLEAN_INTEGRITY],
        ["b", CLEAN_INTEGRITY],
      ]),
      "en",
      "de",
      undefined,
      undefined,
    );
    expect([...result.keys()]).toEqual(["a"]);
  });

  it("omits a clean entry (no reasons apply) from the returned map", () => {
    const result = buildEntryReviewFlags(
      [entry("greeting", "Hello there, friend")],
      new Map([["greeting", "Hallo dort, Freund"]]),
      new Map([["greeting", CLEAN_INTEGRITY]]),
      "en",
      "de",
      undefined,
      undefined,
    );
    expect(result.size).toBe(0);
  });
});

describe("computeReviewFlags: MAX_LENGTH_EXCEEDED", () => {
  it("does not flag a value under its budget", () => {
    const flag = computeReviewFlags(
      input({ sourceValue: "Hi", translatedValue: "Hallo", maxLength: 10 }),
    );
    expect(flag).toBeUndefined();
  });

  it("does not flag a value exactly at its budget, so the boundary is inclusive", () => {
    const flag = computeReviewFlags(
      input({ sourceValue: "Hi", translatedValue: "Hallo", maxLength: 5 }),
    );
    expect(flag).toBeUndefined();
  });

  it("flags a value one unit over its budget", () => {
    const flag = computeReviewFlags(
      input({ sourceValue: "Hi", translatedValue: "Hallo", maxLength: 4 }),
    );
    expect(flag?.reasons).toEqual(["MAX_LENGTH_EXCEEDED"]);
  });

  it("does not flag a value of any length when no budget is configured", () => {
    const flag = computeReviewFlags(
      input({ sourceValue: "Hi", translatedValue: "Hallo dort, Freund" }),
    );
    expect(flag).toBeUndefined();
  });

  it("flags any non-empty value against a budget of zero", () => {
    const flag = computeReviewFlags(
      input({ sourceValue: "Hi", translatedValue: "a", maxLength: 0 }),
    );
    expect(flag?.reasons).toEqual(["MAX_LENGTH_EXCEEDED"]);
  });

  it("does not flag an empty value against a budget of zero", () => {
    const flag = computeReviewFlags(input({ sourceValue: "", translatedValue: "", maxLength: 0 }));
    expect(flag).toBeUndefined();
  });

  it("counts a multi-code-point emoji sequence as one grapheme cluster", () => {
    const family = String.fromCodePoint(0x1f468, 0x200d, 0x1f469, 0x200d, 0x1f467);
    expect(family.length).toBe(8);
    expect([...family].length).toBe(5);

    expect(
      computeReviewFlags(input({ sourceValue: "Hi", translatedValue: family, maxLength: 1 })),
    ).toBeUndefined();
    expect(
      computeReviewFlags(input({ sourceValue: "Hi", translatedValue: family, maxLength: 0 }))
        ?.reasons,
    ).toEqual(["MAX_LENGTH_EXCEEDED"]);
  });

  it("counts a base letter and its combining mark as one grapheme cluster", () => {
    const decomposed = `cafe${String.fromCodePoint(0x301)}`;
    expect(decomposed.length).toBe(5);
    expect([...decomposed].length).toBe(5);

    expect(
      computeReviewFlags(input({ sourceValue: "Hi", translatedValue: decomposed, maxLength: 4 })),
    ).toBeUndefined();
    expect(
      computeReviewFlags(input({ sourceValue: "Hi", translatedValue: decomposed, maxLength: 3 }))
        ?.reasons,
    ).toEqual(["MAX_LENGTH_EXCEEDED"]);
  });

  it("counts an astral character outside the emoji range as one grapheme cluster", () => {
    const script = String.fromCodePoint(0x1d49c, 0x1d4b7, 0x1d4b8);
    expect(script.length).toBe(6);

    expect(
      computeReviewFlags(input({ sourceValue: "Hi", translatedValue: script, maxLength: 3 })),
    ).toBeUndefined();
    expect(
      computeReviewFlags(input({ sourceValue: "Hi", translatedValue: script, maxLength: 2 }))
        ?.reasons,
    ).toEqual(["MAX_LENGTH_EXCEEDED"]);
  });

  it("counts each CJK character as one grapheme cluster, not as its rendered width", () => {
    const japanese = "日本語テキスト";
    expect([...japanese].length).toBe(7);

    expect(
      computeReviewFlags(input({ sourceValue: "Hi", translatedValue: japanese, maxLength: 7 })),
    ).toBeUndefined();
    expect(
      computeReviewFlags(input({ sourceValue: "Hi", translatedValue: japanese, maxLength: 6 }))
        ?.reasons,
    ).toEqual(["MAX_LENGTH_EXCEEDED"]);
  });

  it("measures the value as written, counting leading and trailing whitespace", () => {
    const flag = computeReviewFlags(
      input({ sourceValue: "Hi", translatedValue: "  Hallo  ", maxLength: 5 }),
    );
    expect(flag?.reasons).toEqual(["MAX_LENGTH_EXCEEDED"]);
  });

  it("leaves the input untouched, so the check never rewrites or truncates a value", () => {
    const original = input({
      sourceValue: "Hi",
      translatedValue: "Hallo dort, Freund",
      maxLength: 3,
    });
    const snapshot = { ...original };

    computeReviewFlags(original);

    expect(original).toEqual(snapshot);
    expect(original.translatedValue).toBe("Hallo dort, Freund");
  });

  it("reports the budget overrun alongside every other reason that applies", () => {
    const flag = computeReviewFlags(
      input({
        sourceValue: "Hello there, friend",
        translatedValue: "Hello there, friend",
        maxLength: 4,
      }),
    );
    expect(flag?.reasons).toEqual(["MAX_LENGTH_EXCEEDED", "EQUALS_SOURCE"]);
  });
});

describe("buildEntryReviewFlags: per-key budgets", () => {
  it("applies a budget only to the key it is configured for", () => {
    const result = buildEntryReviewFlags(
      [entry("short", "Hello there, friend"), entry("long", "Hello there, friend")],
      new Map([
        ["short", "Hallo dort, Freund"],
        ["long", "Hallo dort, Freund"],
      ]),
      new Map([
        ["short", CLEAN_INTEGRITY],
        ["long", CLEAN_INTEGRITY],
      ]),
      "en",
      "de",
      undefined,
      new Map([["short", 5]]),
    );

    expect(result.get("short")?.reasons).toEqual(["MAX_LENGTH_EXCEEDED"]);
    expect(result.has("long")).toBe(false);
  });

  it("flags nothing when no budget map is supplied", () => {
    const result = buildEntryReviewFlags(
      [entry("short", "Hello there, friend")],
      new Map([["short", "Hallo dort, Freund"]]),
      new Map([["short", CLEAN_INTEGRITY]]),
      "en",
      "de",
      undefined,
      undefined,
    );

    expect(result.size).toBe(0);
  });
});
