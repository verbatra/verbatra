import {
  pseudolocalizeValue,
  SUPPORTED_FORMATS,
  type SupportedFormat,
  type TranslationEntry,
} from "@verbatra/core";
import { createDefaultRegistry, type FormatAdapter } from "@verbatra/format-adapters";
import { describe, expect, it } from "vitest";
import { gateCandidateValue } from "./integrity-gate.js";

const TOKENS: Readonly<Record<SupportedFormat, readonly string[]>> = {
  "i18next-json": ["{{name}}", "{{count}}", "$t(common.terms)"],
  "vue-i18n-json": ["{name}", "{count}", "@:common.terms"],
  "next-intl-json": ["{name}", "{count, plural, one {# item} other {# items}}", "<b>bold</b>"],
  "ngx-translate-json": ["{{name}}", "{{count}}"],
  xliff: ["{name}", '<x id="1"/>', '<g id="2">inner</g>'],
  yaml: ["{{name}}", "{{count}}"],
  arb: ["{name}", "{count, plural, one {# item} other {# items}}"],
  properties: ["{0}", "{1,number,integer}", "{0, plural, one {# file} other {# files}}"],
  "apple-strings": ["%@", "%1$d", "%%"],
  "apple-xcstrings": ["%@", "%1$d"],
  "android-xml": ["%1$s", "%2$d", "%%"],
  "gettext-po": ["%s", "%(name)s", "%%"],
  ini: ["{name}", "{count}"],
  resx: ["{0}", "{1,-10}", "{2:N0}"],
};

const TEXT = ["Save changes now", "Delete the selected item"] as const;

function adapterFor(format: SupportedFormat): FormatAdapter {
  const resolution = createDefaultRegistry().resolve("", { format });
  if (resolution.status !== "resolved") {
    throw new Error(`no adapter is registered for ${format}`);
  }
  return resolution.adapter;
}

function valuesFor(format: SupportedFormat): readonly string[] {
  const tokens = TOKENS[format];
  const values: string[] = [...tokens];
  for (const first of tokens) {
    for (const second of tokens) {
      values.push(`${TEXT[0]} ${first} ${TEXT[1]} ${second}`);
      values.push(`${first}${TEXT[0]}${second}`);
    }
  }
  return values;
}

function sourceEntry(value: string, adapter: FormatAdapter): TranslationEntry {
  return {
    key: "k",
    namespace: "app",
    value,
    placeholders: adapter.extractPlaceholders(value),
    isPlural: false,
  };
}

type Transform = (value: string) => string;

function problemsFor(
  format: SupportedFormat,
  transform: Transform = pseudolocalizeValue,
): readonly string[] {
  const adapter = adapterFor(format);
  const problems: string[] = [];
  for (const value of valuesFor(format)) {
    const candidate = transform(value);
    if (!gateCandidateValue(sourceEntry(value, adapter), candidate, adapter).accepted) {
      problems.push(`gate refused: ${value}`);
    }
    if (candidate === value) {
      problems.push(`left unchanged: ${value}`);
    }
    for (const text of TEXT) {
      if (value.includes(text) && candidate.includes(text)) {
        problems.push(`text survived untransformed: ${value}`);
      }
    }
  }
  return problems;
}

describe("a pseudolocalized value clears the integrity gate for every registered format", () => {
  it.each(Object.keys(TOKENS) as SupportedFormat[])("%s", (format) => {
    expect(problemsFor(format)).toEqual([]);
  });

  const markersOnly: Transform = (value) => `[${value}]`;

  const identity: Transform = (value) => value;

  it.each(Object.keys(TOKENS) as SupportedFormat[])(
    "%s: a mask that protected everything would be caught as surviving source text",
    (format) => {
      const problems = problemsFor(format, markersOnly);

      expect(problems.length).toBeGreaterThan(0);
      expect(problems.some((problem) => problem.startsWith("text survived untransformed:"))).toBe(
        true,
      );
    },
  );

  it.each(Object.keys(TOKENS) as SupportedFormat[])(
    "%s: a transform that returned its input would be caught as unchanged",
    (format) => {
      const problems = problemsFor(format, identity);

      expect(problems.some((problem) => problem.startsWith("left unchanged:"))).toBe(true);
    },
  );

  it("separates the two probes: markers alone change the value but not the text", () => {
    const problems = problemsFor("i18next-json", markersOnly);

    expect(problems.some((problem) => problem.startsWith("left unchanged:"))).toBe(false);
    expect(problems.some((problem) => problem.startsWith("text survived untransformed:"))).toBe(
      true,
    );
  });

  it("the real transform clears every probe the degenerate ones trip", () => {
    for (const format of Object.keys(TOKENS) as SupportedFormat[]) {
      expect(problemsFor(format)).toEqual([]);
    }
  });

  it("covers every supported format, so the table cannot silently fall behind", () => {
    expect(Object.keys(TOKENS).sort()).toEqual([...SUPPORTED_FORMATS].sort());
  });

  it("builds a non-trivial value set, so the comparisons cannot pass vacuously", () => {
    expect(valuesFor("i18next-json").length).toBeGreaterThan(15);
  });

  it("still accents the surrounding text, so the values are not trivially unchanged", () => {
    const value = `${TEXT[0]} {{name}}`;

    expect(pseudolocalizeValue(value)).not.toBe(value);
    expect(pseudolocalizeValue(value)).toContain("{{name}}");
  });
});

describe("pseudolocalization survives the markup gate for every format", () => {
  const MARKUP_VALUES = [
    "One<br/>two",
    "<b>Save</b> then <i>close</i>",
    "Wait < 5 minutes",
    '<a href="/docs">the docs</a>',
  ] as const;

  function markupRefusals(format: SupportedFormat): readonly string[] {
    const adapter = adapterFor(format);
    return MARKUP_VALUES.filter((value) => {
      const result = gateCandidateValue(
        sourceEntry(value, adapter),
        pseudolocalizeValue(value),
        adapter,
      );
      return !result.accepted && result.reason === "markup";
    });
  }

  it.each(SUPPORTED_FORMATS)("%s never refuses a pseudolocalized value for markup", (format) => {
    expect(markupRefusals(format)).toEqual([]);
  });

  it("would report a format whose pseudolocalization rewrote a tag", () => {
    const adapter = adapterFor("i18next-json");
    const mangled = pseudolocalizeValue("<b>Save</b>").replace("</b>", "</i>");
    expect(gateCandidateValue(sourceEntry("<b>Save</b>", adapter), mangled, adapter)).toEqual({
      accepted: false,
      reason: "markup",
      details: ["-</b>", "+</i>"],
    });
  });

  it("leaves the markup the pseudolocalizer wraps in its own brackets alone", () => {
    const pseudo = pseudolocalizeValue('<a href="/docs">the docs</a>');
    expect(pseudo).toContain('<a href="/docs">');
    expect(pseudo).toContain("</a>");
  });
});
