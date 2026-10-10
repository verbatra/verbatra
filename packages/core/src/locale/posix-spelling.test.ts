import { describe, expect, it } from "vitest";
import { posixSpelling, scriptConventionOf, splitGettextModifier } from "./posix-spelling.js";

describe("scriptConventionOf", () => {
  it.each([
    ["gettext-po", "gettext"],
    ["properties", "icu"],
    ["arb", "icu"],
    ["custom:po", "icu"],
  ] as const)("gives %s the %s convention", (format, convention) => {
    expect(scriptConventionOf(format)).toBe(convention);
  });
});

describe("posixSpelling, gettext convention", () => {
  it.each([
    ["pt-BR", "pt_BR"],
    ["es-419", "es_419"],
    ["sr-Latn", "sr@latin"],
    ["sr-Latn-RS", "sr_RS@latin"],
    ["sr-Cyrl-RS", "sr_RS"],
    ["uz-Cyrl", "uz@cyrillic"],
    ["ks-Deva-IN", "ks_IN@devanagari"],
    ["zh-Hant-TW", "zh_TW"],
    ["zh-Hans", "zh"],
    ["sr-latn-rs", "sr_rs@latin"],
  ])("spells %s as %s", (locale, expected) => {
    expect(posixSpelling(locale, "gettext")).toEqual({ spelling: expected });
  });

  it("refuses a script with no gettext modifier, naming the supported ones", () => {
    expect(posixSpelling("zh-Hant", "gettext")).toEqual({
      reason:
        "gettext writes a script only as one of the modifiers @latin (Latn), @cyrillic (Cyrl), @devanagari (Deva), or leaves it out where the language and region imply it (zh-Hant-TW is written zh_TW)",
    });
  });
});

describe("posixSpelling, icu convention", () => {
  it.each([
    ["sr-Latn", "sr_Latn"],
    ["zh-Hant-TW", "zh_Hant_TW"],
    ["es-419", "es_419"],
  ])("spells %s as %s", (locale, expected) => {
    expect(posixSpelling(locale, "icu")).toEqual({ spelling: expected });
  });
});

describe("posixSpelling, refusals under either convention", () => {
  it.each(["icu", "gettext"] as const)("refuses a variant under %s", (convention) => {
    expect(posixSpelling("de-1996", convention)).toEqual({
      reason: "a variant subtag has no posix spelling",
    });
  });

  it("refuses a tag it cannot parse", () => {
    expect(posixSpelling("en-u-ca-gregory", "icu")).toEqual({
      reason: "it is not a plain language, script and region tag",
    });
  });
});

describe("splitGettextModifier", () => {
  it.each([
    ["pt_BR", { base: "pt_BR", script: undefined }],
    ["sr@latin", { base: "sr", script: "Latn" }],
    ["sr_RS@latin", { base: "sr_RS", script: "Latn" }],
    ["uz@cyrillic", { base: "uz", script: "Cyrl" }],
  ])("splits %s", (spelling, expected) => {
    expect(splitGettextModifier(spelling)).toEqual(expected);
  });

  it.each(["sr@Latin", "ca@valencia", "sr@"])("rejects the unknown modifier in %s", (spelling) => {
    expect(splitGettextModifier(spelling)).toBeUndefined();
  });
});
