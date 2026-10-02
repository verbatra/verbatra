// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the fixtures are placeholder text under test, not templates
import {
  type FormatId,
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
        '2 source values hold a placeholder-like token that i18next-json does not protect: "greeting", "total". These tokens are not protected during translation, so review the translations, or switch the syntax if your library does not interpolate them.',
    });
  });

  it("asks for a careful hand translation instead when machine translation is off", () => {
    const notice = noticeFor("i18next-json", { greeting: "Hello {name}" }, "human-only");

    expect(notice?.message).toBe(
      '1 source value holds a placeholder-like token that i18next-json does not protect: "greeting". Machine translation is off, so keep these tokens unchanged when you translate the values, or switch the syntax if your library does not interpolate them.',
    );
    expect(notice?.message).not.toContain("during translation");
  });

  it("uses the singular for one value", () => {
    expect(noticeFor("yaml", { items: "%{count} items" })?.message).toContain(
      "1 source value holds a placeholder-like token that yaml does not protect",
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
