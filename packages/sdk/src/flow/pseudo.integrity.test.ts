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

describe("a pseudolocalized value clears the integrity gate for every registered format", () => {
  it.each(Object.keys(TOKENS) as SupportedFormat[])("%s", (format) => {
    const adapter = adapterFor(format);
    const refused = valuesFor(format).filter(
      (value) =>
        !gateCandidateValue(sourceEntry(value, adapter), pseudolocalizeValue(value), adapter)
          .accepted,
    );

    expect(refused).toEqual([]);
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
