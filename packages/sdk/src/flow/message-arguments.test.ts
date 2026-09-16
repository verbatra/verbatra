import { describe, expect, it } from "vitest";
import { describeIcuMessageArguments, describeMessageArguments } from "./message-arguments.js";

describe("describeMessageArguments: a message with nothing to interpolate", () => {
  it("reports no arguments for an empty token list", () => {
    expect(describeMessageArguments([])).toEqual({ style: "none" });
  });

  it("ignores an escaped percent literal", () => {
    expect(describeMessageArguments(["%%"])).toEqual({ style: "none" });
  });

  it("ignores an inline markup tag", () => {
    expect(describeMessageArguments(["<b>"])).toEqual({ style: "none" });
  });

  it("ignores an xliff placeholder element", () => {
    expect(describeMessageArguments(['<x id="1"/>'])).toEqual({ style: "none" });
  });

  it("ignores an i18next nesting reference, which resolves another key rather than an argument", () => {
    expect(describeMessageArguments(["$t(other.key)"])).toEqual({ style: "none" });
  });

  it("ignores a double-brace token with no name inside it", () => {
    expect(describeMessageArguments(["{{}}"])).toEqual({ style: "none" });
  });
});

describe("describeMessageArguments: named arguments", () => {
  it("reads a double-brace name", () => {
    expect(describeMessageArguments(["{{name}}"])).toEqual({
      style: "named",
      named: [{ name: "name", type: "unknown" }],
    });
  });

  it("reads a single-brace name", () => {
    expect(describeMessageArguments(["{name}"])).toEqual({
      style: "named",
      named: [{ name: "name", type: "unknown" }],
    });
  });

  it("types a double-brace argument the format annotated as a number", () => {
    expect(describeMessageArguments(["{{count, number}}"])).toEqual({
      style: "named",
      named: [{ name: "count", type: "number" }],
    });
  });

  it("types a MessageFormat number argument", () => {
    expect(describeMessageArguments(["{count,number}"])).toEqual({
      style: "named",
      named: [{ name: "count", type: "number" }],
    });
  });

  it("types a MessageFormat number argument that also carries a style", () => {
    expect(describeMessageArguments(["{count,number,#.##}"])).toEqual({
      style: "named",
      named: [{ name: "count", type: "number" }],
    });
  });

  it("types a MessageFormat plural argument as a number", () => {
    expect(describeMessageArguments(["{n,plural}"])).toEqual({
      style: "named",
      named: [{ name: "n", type: "number" }],
    });
  });

  it("leaves a MessageFormat date argument untyped rather than guessing a representation", () => {
    expect(describeMessageArguments(["{when,date}"])).toEqual({
      style: "named",
      named: [{ name: "when", type: "unknown" }],
    });
  });

  it("leaves a MessageFormat select argument untyped", () => {
    expect(describeMessageArguments(["{gender,select}"])).toEqual({
      style: "named",
      named: [{ name: "gender", type: "unknown" }],
    });
  });

  it("reads a gettext named conversion and its type", () => {
    expect(describeMessageArguments(["%(count)d"])).toEqual({
      style: "named",
      named: [{ name: "count", type: "number" }],
    });
  });

  it("reads a gettext named string conversion", () => {
    expect(describeMessageArguments(["%(who)s"])).toEqual({
      style: "named",
      named: [{ name: "who", type: "string" }],
    });
  });

  it("keeps a name that is not a valid identifier rather than dropping the argument", () => {
    expect(describeMessageArguments(["{some thing}"])).toEqual({
      style: "named",
      named: [{ name: "some thing", type: "unknown" }],
    });
  });

  it("keeps document order across several names", () => {
    expect(describeMessageArguments(["{{b}}", "{{a}}"])).toEqual({
      style: "named",
      named: [
        { name: "b", type: "unknown" },
        { name: "a", type: "unknown" },
      ],
    });
  });

  it("collapses a name that appears twice into one argument", () => {
    expect(describeMessageArguments(["{{name}}", "{{name}}"])).toEqual({
      style: "named",
      named: [{ name: "name", type: "unknown" }],
    });
  });

  it("widens a name whose two occurrences disagree about its type", () => {
    expect(describeMessageArguments(["{count,number}", "{count}"])).toEqual({
      style: "named",
      named: [{ name: "count", type: "unknown" }],
    });
  });

  it("widens the same disagreement when the typed occurrence comes second", () => {
    expect(describeMessageArguments(["{count}", "{count,number}"])).toEqual({
      style: "named",
      named: [{ name: "count", type: "unknown" }],
    });
  });
});

describe("describeMessageArguments: positional arguments", () => {
  it("reads a bare printf conversion as one anonymous argument", () => {
    expect(describeMessageArguments(["%d"])).toEqual({
      style: "positional",
      positional: ["number"],
    });
  });

  it("types a printf string conversion", () => {
    expect(describeMessageArguments(["%s"])).toEqual({
      style: "positional",
      positional: ["string"],
    });
  });

  it("leaves an Apple object conversion untyped", () => {
    expect(describeMessageArguments(["%@"])).toEqual({
      style: "positional",
      positional: ["unknown"],
    });
  });

  it("keeps document order across several anonymous conversions", () => {
    expect(describeMessageArguments(["%@", "%d"])).toEqual({
      style: "positional",
      positional: ["unknown", "number"],
    });
  });

  it("places an explicitly numbered printf conversion at its own index", () => {
    expect(describeMessageArguments(["%2$d", "%1$@"])).toEqual({
      style: "positional",
      positional: ["unknown", "number"],
    });
  });

  it("reads a brace-numbered argument as positional", () => {
    expect(describeMessageArguments(["{1}", "{0}"])).toEqual({
      style: "positional",
      positional: ["unknown", "unknown"],
    });
  });

  it("fills a gap left by an index the message never uses", () => {
    expect(describeMessageArguments(["{2}"])).toEqual({
      style: "positional",
      positional: ["unknown", "unknown", "unknown"],
    });
  });

  it("types a brace-numbered MessageFormat number argument", () => {
    expect(describeMessageArguments(["{0,number}"])).toEqual({
      style: "positional",
      positional: ["number"],
    });
  });

  it("reads a .NET composite item with an alignment as positional and untyped", () => {
    expect(describeMessageArguments(["{0,-5}"])).toEqual({
      style: "positional",
      positional: ["unknown"],
    });
  });

  it("reads a .NET composite item with a format string as positional and untyped", () => {
    expect(describeMessageArguments(["{0:C}"])).toEqual({
      style: "positional",
      positional: ["unknown"],
    });
  });

  it("reads a .NET composite item carrying both an alignment and a format string", () => {
    expect(describeMessageArguments(["{0,-5:C}"])).toEqual({
      style: "positional",
      positional: ["unknown"],
    });
  });
});

describe("describeMessageArguments: a message verbatra will not guess at", () => {
  it("refuses a message that mixes a name with an anonymous conversion", () => {
    expect(describeMessageArguments(["{{name}}", "%d"])).toEqual({
      style: "unresolved",
      reason: "mixed-argument-styles",
    });
  });

  it("refuses a message that mixes a name with a numbered argument", () => {
    expect(describeMessageArguments(["{{name}}", "{0}"])).toEqual({
      style: "unresolved",
      reason: "mixed-argument-styles",
    });
  });

  it("refuses a message that mixes a numbered conversion with an anonymous one", () => {
    expect(describeMessageArguments(["%1$d", "%s"])).toEqual({
      style: "unresolved",
      reason: "mixed-argument-styles",
    });
  });
});

describe("describeMessageArguments: an index a catalog must not be trusted with", () => {
  it("accepts the highest index that still fits the bound", () => {
    expect(describeMessageArguments(["{63}"])).toMatchObject({
      style: "positional",
      positional: expect.objectContaining({ length: 64 }),
    });
  });

  it("refuses the first index past the bound rather than sizing a tuple from it", () => {
    expect(describeMessageArguments(["{64}"])).toEqual({
      style: "unresolved",
      reason: "argument-index-out-of-range",
    });
  });

  it("refuses an index large enough to exhaust memory, without throwing", () => {
    expect(describeMessageArguments(["{2147483647}"])).toEqual({
      style: "unresolved",
      reason: "argument-index-out-of-range",
    });
  });

  it("refuses an index large enough to render a catalog-sized declaration", () => {
    expect(describeMessageArguments(["{3000000}"])).toEqual({
      style: "unresolved",
      reason: "argument-index-out-of-range",
    });
  });

  it("keeps the lowest printf position a message may legitimately name", () => {
    expect(describeMessageArguments(["%1$@"])).toEqual({
      style: "positional",
      positional: ["unknown"],
    });
  });

  it("refuses a printf position below the first one rather than dropping it", () => {
    expect(describeMessageArguments(["%0$@"])).toEqual({
      style: "unresolved",
      reason: "argument-index-out-of-range",
    });
  });

  it("refuses the whole message when a below-range position sits beside a valid one", () => {
    expect(describeMessageArguments(["%0$@", "%1$@"])).toEqual({
      style: "unresolved",
      reason: "argument-index-out-of-range",
    });
  });

  it("refuses an out-of-range printf position the same way", () => {
    expect(describeMessageArguments(["%999999$d"])).toEqual({
      style: "unresolved",
      reason: "argument-index-out-of-range",
    });
  });

  it("refuses the whole message when one of several indexes is out of range", () => {
    expect(describeMessageArguments(["{0}", "{9000000}"])).toEqual({
      style: "unresolved",
      reason: "argument-index-out-of-range",
    });
  });
});

describe("describeMessageArguments: one position mentioned twice", () => {
  it("keeps the type both mentions agree on", () => {
    expect(describeMessageArguments(["{0,number}", "{0,number}"])).toEqual({
      style: "positional",
      positional: ["number"],
    });
  });

  it("widens a position whose two mentions disagree", () => {
    expect(describeMessageArguments(["{0,number}", "{0}"])).toEqual({
      style: "positional",
      positional: ["unknown"],
    });
  });

  it("widens the same disagreement when the typed mention comes second", () => {
    expect(describeMessageArguments(["{0}", "{0,number}"])).toEqual({
      style: "positional",
      positional: ["unknown"],
    });
  });
});

describe("tokens the classifier deliberately ignores", () => {
  it.each([
    ["a bare percent sign", "%"],
    ["a percent followed by two letters", "%ab"],
    ["a gettext-shaped token with no conversion letter", "%(name)"],
  ])("ignores %s rather than inventing an argument", (_label, token) => {
    expect(describeMessageArguments([token])).toEqual({ style: "none" });
  });

  it("still reads a single unknown conversion character as one anonymous argument", () => {
    expect(describeMessageArguments(["%$"])).toEqual({
      style: "positional",
      positional: ["unknown"],
    });
  });

  it.each([
    ["a token with no delimiter at all", "name"],
    ["an unclosed brace", "{name"],
    ["a lone closing brace", "name}"],
  ])("ignores %s", (_label, token) => {
    expect(describeMessageArguments([token])).toEqual({ style: "none" });
  });

  it("ignores an unrecognised token without discarding a recognised sibling", () => {
    expect(describeMessageArguments(["%", "{{name}}", "stray"])).toEqual({
      style: "named",
      named: [{ name: "name", type: "unknown" }],
    });
  });
});

describe("describeIcuMessageArguments: an ICU message read for its full argument set", () => {
  it("declares an argument only one select branch uses, as optional", () => {
    expect(
      describeIcuMessageArguments(
        "{gender, select, female {{name} invited you} other {Someone invited you}}",
      ),
    ).toEqual({
      style: "named",
      named: [
        { name: "gender", type: "string" },
        { name: "name", type: "unknown", optional: true },
      ],
    });
  });

  it("reports a message it cannot parse as having invalid syntax", () => {
    expect(describeIcuMessageArguments("Hello {name")).toEqual({
      style: "unresolved",
      reason: "invalid-message-syntax",
    });
  });

  it("reports no arguments for plain text", () => {
    expect(describeIcuMessageArguments("Hello")).toEqual({ style: "none" });
  });

  it("keeps reading a numbered ICU argument as positional", () => {
    expect(describeIcuMessageArguments("{1} and {0}")).toEqual({
      style: "positional",
      positional: ["unknown", "unknown"],
    });
  });

  it("declares a trailing position only some branches use as optional", () => {
    expect(describeIcuMessageArguments("{0, plural, one {{1}} other {x}}")).toEqual({
      style: "positional",
      positional: ["number", "unknown"],
      optionalFrom: 1,
    });
  });

  it("declares every trailing position as optional once all of them are", () => {
    expect(describeIcuMessageArguments("{0, select, a {{1} {2}} other {x}}")).toEqual({
      style: "positional",
      positional: ["string", "unknown", "unknown"],
      optionalFrom: 1,
    });
  });

  it("keeps an optional position required when a required one follows it", () => {
    expect(describeIcuMessageArguments("{0, select, a {{1}} other {x}} {2}")).toEqual({
      style: "positional",
      positional: ["string", "unknown", "unknown"],
    });
  });

  it("keeps an unused gap before an optional position required", () => {
    expect(describeIcuMessageArguments("{0, select, a {{2}} other {x}}")).toEqual({
      style: "positional",
      positional: ["string", "unknown", "unknown"],
      optionalFrom: 2,
    });
  });

  it("keeps a position required when one mention of it is required", () => {
    expect(describeIcuMessageArguments("{0, select, a {{1}} other {x}} {1}")).toEqual({
      style: "positional",
      positional: ["string", "unknown"],
    });
  });

  it("keeps the index bound for a numbered ICU argument", () => {
    expect(describeIcuMessageArguments("{64}")).toEqual({
      style: "unresolved",
      reason: "argument-index-out-of-range",
    });
  });
});

describe("describeIcuMessageArguments: the type each ICU argument kind declares", () => {
  it.each([
    ["a plain argument", "{v}", "unknown"],
    ["a number argument", "{v, number}", "number"],
    ["a plural argument", "{v, plural, other {#}}", "number"],
    ["a selectordinal argument", "{v, selectordinal, other {#th}}", "number"],
    ["a date argument", "{v, date, short}", "date"],
    ["a time argument", "{v, time}", "date"],
    ["a select argument", "{v, select, a {A} other {B}}", "string"],
  ])("declares %s as %s", (_label, message, type) => {
    expect(describeIcuMessageArguments(message)).toEqual({
      style: "named",
      named: [{ name: "v", type }],
    });
  });

  it("keeps a type two kinds agree on", () => {
    expect(describeIcuMessageArguments("{v, plural, other {{v, number}}}")).toEqual({
      style: "named",
      named: [{ name: "v", type: "number" }],
    });
  });

  it("keeps a date and a number use of one name as a date, whose type already accepts a number", () => {
    expect(describeIcuMessageArguments("{v, date} {v, number}")).toEqual({
      style: "named",
      named: [{ name: "v", type: "date" }],
    });
  });

  it("declares a date and a plain use of one name as the union of both", () => {
    expect(describeIcuMessageArguments("{d, date, short} ({d})")).toEqual({
      style: "named",
      named: [{ name: "d", type: "date-or-string" }],
    });
  });

  it("declares a date and a select use of one name as the union of both", () => {
    expect(describeIcuMessageArguments("{d, date} {d, select, a {A} other {B}}")).toEqual({
      style: "named",
      named: [{ name: "d", type: "date-or-string" }],
    });
  });

  it("declares a plural and a plain use of one name as the untyped union of both", () => {
    expect(describeIcuMessageArguments("{n, plural, other {#}} {n}")).toEqual({
      style: "named",
      named: [{ name: "n", type: "unknown" }],
    });
  });

  it("declares a number and a select use of one name as the untyped union of both", () => {
    expect(describeIcuMessageArguments("{n, number} {n, select, a {A} other {B}}")).toEqual({
      style: "named",
      named: [{ name: "n", type: "unknown" }],
    });
  });

  it("declares a numbered date and plain use of one position as the union of both", () => {
    expect(describeIcuMessageArguments("{0, date} {0}")).toEqual({
      style: "positional",
      positional: ["date-or-string"],
    });
  });

  it("types a numbered ICU argument by its kind", () => {
    expect(describeIcuMessageArguments("{0, number}")).toEqual({
      style: "positional",
      positional: ["number"],
    });
  });
});

describe("describeMessageArguments: an i18next formatter", () => {
  it("types a double-brace datetime argument as a date", () => {
    expect(describeMessageArguments(["{{when, datetime}}"])).toEqual({
      style: "named",
      named: [{ name: "when", type: "date" }],
    });
  });

  it("declares a datetime and a plain use of one name as the union of both", () => {
    expect(describeMessageArguments(["{{d, datetime}}", "{{d}}"])).toEqual({
      style: "named",
      named: [{ name: "d", type: "date-or-string" }],
    });
  });

  it("reads a formatter's name past its inline options", () => {
    expect(
      describeMessageArguments([
        "{{when, datetime(dateStyle: short)}}",
        "{{n, number(minimumFractionDigits: 2)}}",
      ]),
    ).toEqual({
      style: "named",
      named: [
        { name: "when", type: "date" },
        { name: "n", type: "number" },
      ],
    });
  });

  it("leaves an unrecognised double-brace formatter untyped", () => {
    expect(describeMessageArguments(["{{name, uppercase}}"])).toEqual({
      style: "named",
      named: [{ name: "name", type: "unknown" }],
    });
  });

  it("does not read datetime as a date inside a single-brace token", () => {
    expect(describeMessageArguments(["{when,datetime}"])).toEqual({
      style: "named",
      named: [{ name: "when", type: "unknown" }],
    });
  });
});

describe("describeMessageArguments: an i18next unescaped interpolation", () => {
  it.each([
    ["with a space after the prefix", "{{- name}}"],
    ["with no space after the prefix", "{{-name}}"],
    ["with spaces around the prefix", "{{ -  name }}"],
  ])("reads the name behind the prefix %s", (_label, token) => {
    expect(describeMessageArguments([token])).toEqual({
      style: "named",
      named: [{ name: "name", type: "unknown" }],
    });
  });

  it("collapses an escaped and an unescaped use of one name into one argument", () => {
    expect(describeMessageArguments(["{{name}}", "{{- name}}"])).toEqual({
      style: "named",
      named: [{ name: "name", type: "unknown" }],
    });
  });

  it("keeps a formatter behind the prefix", () => {
    expect(describeMessageArguments(["{{- when, datetime}}"])).toEqual({
      style: "named",
      named: [{ name: "when", type: "date" }],
    });
  });

  it("reads a name followed by a formatter as that name", () => {
    expect(describeMessageArguments(["{{name, format}}"])).toEqual({
      style: "named",
      named: [{ name: "name", type: "unknown" }],
    });
  });

  it("ignores a prefix with no name behind it", () => {
    expect(describeMessageArguments(["{{-}}"])).toEqual({ style: "none" });
  });

  it("keeps a dash inside a single-brace name, which carries no unescape prefix", () => {
    expect(describeMessageArguments(["{-name}"])).toEqual({
      style: "named",
      named: [{ name: "-name", type: "unknown" }],
    });
  });
});
