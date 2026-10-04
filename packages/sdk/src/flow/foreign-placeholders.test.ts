// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the fixtures are placeholder text under test, not templates
import {
  type FormatId,
  foreignPlaceholderTokens,
  type LocaleResource,
  PLACEHOLDER_SYNTAXES,
  type PlaceholderSyntax,
  SUPPORTED_FORMATS,
  type SupportedFormat,
  type TranslationEntry,
} from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { selectAdapter } from "../selection/select-adapter.js";
import {
  droppedForeignPlaceholders,
  type ForeignPlaceholderTranslation,
  NATIVE_PLACEHOLDER_SYNTAXES,
  sourceForeignPlaceholderNotice,
  withForeignPlaceholderReason,
  withForeignPlaceholders,
} from "./foreign-placeholders.js";

const SAMPLES: Readonly<Record<PlaceholderSyntax, string>> = {
  "double-brace": "Hi {{name}}!",
  "single-brace": "Hi {name}!",
  printf: "Hi %s!",
  "python-named": "Hi %(name)s!",
  ruby: "Hi %{name}!",
  "dollar-brace": "Hi ${name}!",
};

const UNICODE_SAMPLES: readonly (readonly [PlaceholderSyntax, string])[] = [
  ["double-brace", "Hi {{名前}}!"],
  ["single-brace", "Hi {名前}!"],
  ["ruby", "Hi %{名前}!"],
  ["dollar-brace", "Hi ${名前}!"],
];

function resource(format: FormatId, values: Record<string, string>): LocaleResource {
  const entries = new Map<string, TranslationEntry>();
  for (const [key, value] of Object.entries(values)) {
    entries.set(key, { key, namespace: "", value, placeholders: [], isPlural: false });
  }
  return { locale: "en", namespace: "", format, entries };
}

function noticeFor(
  format: FormatId,
  values: Record<string, string>,
  translation: ForeignPlaceholderTranslation = "machine",
) {
  return sourceForeignPlaceholderNotice(
    format,
    resource(format, values),
    Object.keys(values),
    translation,
  );
}

describe("NATIVE_PLACEHOLDER_SYNTAXES", () => {
  it("classifies every supported format, so the table cannot silently fall behind", () => {
    expect(Object.keys(NATIVE_PLACEHOLDER_SYNTAXES).sort()).toEqual([...SUPPORTED_FORMATS].sort());
  });

  it.each(
    SUPPORTED_FORMATS.flatMap((format) =>
      PLACEHOLDER_SYNTAXES.map(
        (syntax) => [format, syntax] as [SupportedFormat, PlaceholderSyntax],
      ),
    ),
  )("%s: %s is native exactly when the adapter extracts it", (format, syntax) => {
    const extracted = selectAdapter(format).extractPlaceholders(SAMPLES[syntax]);

    expect(extracted.length > 0).toBe(NATIVE_PLACEHOLDER_SYNTAXES[format].includes(syntax));
  });

  it.each(
    SUPPORTED_FORMATS.flatMap((format) =>
      UNICODE_SAMPLES.map(([syntax, sample]) => [format, syntax, sample] as const),
    ),
  )(
    "%s: a non-ASCII %s name is flagged exactly when the syntax is foreign",
    (format, syntax, sample) => {
      const native = NATIVE_PLACEHOLDER_SYNTAXES[format].includes(syntax);
      const dropped = droppedForeignPlaceholders(format, sample, "Hallo");

      expect(dropped.length > 0).toBe(!native);
      if (!native) {
        expect(selectAdapter(format).extractPlaceholders(sample)).toEqual([]);
      }
    },
  );

  it("treats the resx brace escapes as native", () => {
    expect(droppedForeignPlaceholders("resx", "Use {{x}} and {0}", "Nutze {0}")).toEqual([]);
  });
});

const SINGLE_BRACE_NAMES = [
  "name",
  "0",
  "\u0663",
  "_x",
  "n\u00famero",
  "\u540d\u524d",
  "nom_\u00e9",
  "\u0928\u093e\u092e",
  "e\u0301t\u00e9",
] as const;

const NON_ICU_NAMES = ["$count", "user-id"] as const;

const ICU_STRICT_FORMATS: readonly SupportedFormat[] = ["next-intl-json", "arb"];

const ICU_PARSING_FORMATS: readonly SupportedFormat[] = [...ICU_STRICT_FORMATS, "properties"];

const SINGLE_BRACE_NATIVE_FORMATS = SUPPORTED_FORMATS.filter((format) =>
  NATIVE_PLACEHOLDER_SYNTAXES[format].includes("single-brace"),
);

function detectedSingleBraceNames(value: string): readonly string[] {
  const allButSingleBrace = PLACEHOLDER_SYNTAXES.filter((syntax) => syntax !== "single-brace");
  return foreignPlaceholderTokens(value, allButSingleBrace).map(
    (token) => /^\{\s*([^\s,}]+)/u.exec(token)?.[1] ?? token,
  );
}

function expectAgreement(format: SupportedFormat, value: string): void {
  const names = detectedSingleBraceNames(value);
  const extracted = selectAdapter(format).extractPlaceholders(value);

  expect(names.length).toBeGreaterThan(0);
  for (const name of names) {
    expect(extracted.some((token) => token.startsWith(`{${name}`))).toBe(true);
  }
}

describe("single-brace detection agrees with the adapters that treat it as native", () => {
  it.each(
    SINGLE_BRACE_NATIVE_FORMATS.flatMap((format) =>
      SINGLE_BRACE_NAMES.filter((name) => format !== "resx" || name !== "\u0663").map(
        (name) => [format, `Hi {${name}}!`] as const,
      ),
    ),
  )("%s extracts every single-brace name the detector matches in %s", (format, value) => {
    expectAgreement(format, value);
  });

  it("guards a resx index in non-ASCII digits by its bare braces, as .NET rejects it", () => {
    expect(selectAdapter("resx").extractPlaceholders("Hi {\u0663}!")).toEqual(["{", "}"]);
  });

  it.each(
    SINGLE_BRACE_NATIVE_FORMATS.filter((format) => !ICU_STRICT_FORMATS.includes(format)).flatMap(
      (format) => NON_ICU_NAMES.map((name) => [format, `Hi {${name}}!`] as const),
    ),
  )("%s extracts a name ICU would reject in %s", (format, value) => {
    expectAgreement(format, value);
  });

  it.each(
    ICU_PARSING_FORMATS.flatMap((format) =>
      SINGLE_BRACE_NAMES.map(
        (name) => [format, `{${name}, plural, one {# a} other {# b}}`] as const,
      ),
    ),
  )("%s extracts the ICU argument the detector matches in %s", (format, value) => {
    expectAgreement(format, value);
  });
});

describe("droppedForeignPlaceholders", () => {
  it.each<[FormatId, string, string, readonly string[]]>([
    ["i18next-json", "Hello {name}, welcome back!", "Hallo, willkommen zurück!", ["{name}"]],
    ["yaml", "%{count} items", "Artikel", ["%{count}"]],
    ["gettext-po", "Hello {name}", "Hallo", ["{name}"]],
    ["android-xml", "Hello {name}", "Hallo", ["{name}"]],
    ["xliff", "%d files", "Dateien", ["%d"]],
    ["vue-i18n-json", "Hello {{name}}", "Hallo", ["{{name}}"]],
  ])("%s: names %j dropped from %j", (format, source, target, expected) => {
    expect(droppedForeignPlaceholders(format, source, target)).toEqual(expected);
  });

  it("never flags a native token, which the integrity gate checks instead", () => {
    expect(droppedForeignPlaceholders("i18next-json", "Hello {{name}}", "Hallo")).toEqual([]);
    expect(droppedForeignPlaceholders("gettext-po", "Hi %(user)s, %d new", "Hallo")).toEqual([]);
  });

  it("skips a third-party format, which has no row in the table", () => {
    expect(droppedForeignPlaceholders("custom:kv", "Hello {name}", "Hallo")).toEqual([]);
  });
});

const ICU_FORMATS: readonly FormatId[] = ["i18next-json", "yaml", "gettext-po", "android-xml"];

const SELECT = "{gender, select, male {He replied} female {She replied} other {They replied}}";
const PLURAL = "You have {count, plural, one {one item} other {many items}}";
const NESTED =
  "{gender, select, male {{n, plural, one {his item} other {his items}}} other {{n, plural, one {their item} other {their items}}}}";

describe("droppedForeignPlaceholders: ICU arguments", () => {
  it.each(ICU_FORMATS)("%s: translated select and plural arms are not flagged", (format) => {
    expect(
      droppedForeignPlaceholders(
        format,
        SELECT,
        "{gender, select, male {Er antwortete} female {Sie antwortete} other {Sie antworteten}}",
      ),
    ).toEqual([]);
    expect(
      droppedForeignPlaceholders(
        format,
        PLURAL,
        "Du hast {count, plural, one {einen Artikel} other {viele Artikel}}",
      ),
    ).toEqual([]);
    expect(
      droppedForeignPlaceholders(
        format,
        NESTED,
        "{gender, select, male {{n, plural, one {sein Artikel} other {seine Artikel}}} other {{n, plural, one {ihr Artikel} other {ihre Artikel}}}}",
      ),
    ).toEqual([]);
  });

  it.each(ICU_FORMATS)("%s: a dropped head is flagged by the head alone", (format) => {
    expect(droppedForeignPlaceholders(format, SELECT, "Er antwortete")).toEqual([
      "{gender, select,",
    ]);
    expect(droppedForeignPlaceholders(format, PLURAL, "Du hast viele Artikel")).toEqual([
      "{count, plural,",
    ]);
    expect(droppedForeignPlaceholders(format, NESTED, "Seine Artikel")).toEqual([
      "{gender, select,",
    ]);
  });
});

describe("withForeignPlaceholderReason", () => {
  it("returns the flag unchanged when nothing foreign was dropped", () => {
    const flag = { status: "review", reasons: ["EQUALS_SOURCE"] } as const;
    expect(withForeignPlaceholderReason(flag, "i18next-json", "Hi {a}", "Hi {a}")).toBe(flag);
    expect(withForeignPlaceholderReason(undefined, "i18next-json", "Hi", "Hallo")).toBeUndefined();
  });

  it("creates a flag when there was none", () => {
    expect(withForeignPlaceholderReason(undefined, "i18next-json", "Hi {a}", "Hallo")).toEqual({
      status: "review",
      reasons: ["FOREIGN_PLACEHOLDER_CHANGED"],
    });
  });

  it("appends the reason after the reasons already raised", () => {
    const flag = { status: "review", reasons: ["LENGTH_RATIO_OUTLIER"] } as const;
    expect(withForeignPlaceholderReason(flag, "i18next-json", "Hi {a}", "Hallo")).toEqual({
      status: "review",
      reasons: ["LENGTH_RATIO_OUTLIER", "FOREIGN_PLACEHOLDER_CHANGED"],
    });
  });
});

describe("withForeignPlaceholders", () => {
  function entryOf(format: SupportedFormat, value: string): TranslationEntry {
    return {
      key: "k",
      namespace: "",
      value,
      placeholders: selectAdapter(format).extractPlaceholders(value),
      isPlural: false,
    };
  }

  it("appends each foreign token once, in source order, after the native placeholders", () => {
    const entry = entryOf("vue-i18n-json", "{{b}} and {name} and {{a}} then {{b}} and %s");

    expect(withForeignPlaceholders(entry, "vue-i18n-json").placeholders).toEqual([
      "{name}",
      "{{b}}",
      "{{a}}",
      "%s",
    ]);
  });

  it("does not repeat a foreign token the native placeholders already list", () => {
    const entry: TranslationEntry = {
      ...entryOf("i18next-json", "Hi {name}"),
      placeholders: ["{name}"],
    };

    expect(withForeignPlaceholders(entry, "i18next-json").placeholders).toEqual(["{name}"]);
  });

  it("returns the entry itself when the value holds no foreign token", () => {
    const entry = entryOf("i18next-json", "Hi {{name}}, 50%off");

    expect(withForeignPlaceholders(entry, "i18next-json")).toBe(entry);
  });

  it("returns the entry itself for a third-party format", () => {
    const entry: TranslationEntry = {
      key: "k",
      namespace: "",
      value: "Hi {name} %s",
      placeholders: [],
      isPlural: false,
    };

    expect(withForeignPlaceholders(entry, "custom:kv")).toBe(entry);
  });
});

describe("sourceForeignPlaceholderNotice", () => {
  it("names the count and the keys of the affected pending values, without prescribing a syntax", () => {
    const notice = noticeFor("i18next-json", {
      greeting: "Hello {name}",
      plain: "Save",
      total: "%s items",
    });

    expect(notice).toEqual({
      code: "SOURCE_FOREIGN_PLACEHOLDERS",
      message:
        '2 source values hold a placeholder-like token of another syntax than i18next-json uses: "greeting", "total". Machine translation providers get these tokens masked and leave a value untranslated when that fails, but an LLM provider or a person must keep them unchanged, so review the translations, or switch the syntax if your library does not interpolate them.',
    });
  });

  it("asks for a careful hand translation instead when machine translation is off", () => {
    const notice = noticeFor("i18next-json", { greeting: "Hello {name}" }, "human-only");

    expect(notice?.message).toBe(
      '1 source value holds a placeholder-like token of another syntax than i18next-json uses: "greeting". Machine translation is off, so keep these tokens unchanged when you translate the values, or switch the syntax if your library does not interpolate them.',
    );
    expect(notice?.message).not.toContain("during translation");
  });

  it("uses the singular for one value", () => {
    expect(noticeFor("yaml", { items: "%{count} items" })?.message).toContain(
      "1 source value holds a placeholder-like token of another syntax than yaml uses",
    );
  });

  it("names the first five keys and counts the rest", () => {
    const values = Object.fromEntries(
      Array.from({ length: 7 }, (_, index) => [`k${index}`, `Hi {name${index}}`]),
    );
    const message = noticeFor("i18next-json", values)?.message;

    expect(message).toContain('"k0", "k1", "k2", "k3", "k4", and 2 more.');
    expect(message).not.toContain('"k5"');
  });

  it("only looks at the pending keys", () => {
    const source = resource("i18next-json", { greeting: "Hello {name}", plain: "Save" });

    expect(
      sourceForeignPlaceholderNotice("i18next-json", source, ["plain"], "machine"),
    ).toBeUndefined();
    expect(
      sourceForeignPlaceholderNotice("i18next-json", source, ["absent"], "machine"),
    ).toBeUndefined();
    expect(sourceForeignPlaceholderNotice("i18next-json", source, [], "machine")).toBeUndefined();
  });

  it("is absent when no pending value holds a foreign token", () => {
    expect(
      noticeFor("i18next-json", { greeting: "Hello {{name}}", sale: "50%off" }),
    ).toBeUndefined();
  });

  it("is absent for a third-party format", () => {
    expect(noticeFor("custom:kv", { greeting: "Hi %s" })).toBeUndefined();
  });
});
