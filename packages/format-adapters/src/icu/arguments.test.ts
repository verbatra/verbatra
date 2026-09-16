import { describe, expect, it } from "vitest";
import { analyzeIcuValue } from "./analyze.js";
import { icuMessageArguments } from "./arguments.js";

describe("icuMessageArguments: a message with nothing to interpolate", () => {
  it("reports no arguments for plain text", () => {
    expect(icuMessageArguments("just text")).toEqual({ valid: true, arguments: [] });
  });

  it("reports no arguments for a tag that wraps plain text", () => {
    expect(icuMessageArguments("<b>bold</b>")).toEqual({ valid: true, arguments: [] });
  });

  it("does not count the plural number sign as an argument of its own", () => {
    expect(icuMessageArguments("{n, plural, other {# items}}")).toEqual({
      valid: true,
      arguments: [{ name: "n", kinds: ["plural"], required: true }],
    });
  });
});

describe("icuMessageArguments: invalid syntax", () => {
  it("reports an unparseable message as invalid rather than guessing at its arguments", () => {
    expect(icuMessageArguments("Hello {name")).toEqual({ valid: false });
  });
});

describe("icuMessageArguments: the kind each argument is formatted as", () => {
  it.each([
    ["a plain argument", "{v}", "argument"],
    ["a number argument", "{v, number}", "number"],
    ["a number argument with a style", "{v, number, ::currency/EUR}", "number"],
    ["a date argument", "{v, date, short}", "date"],
    ["a time argument", "{v, time}", "time"],
    ["a select argument", "{v, select, a {A} other {B}}", "select"],
    ["a plural argument", "{v, plural, one {1} other {n}}", "plural"],
    ["a selectordinal argument", "{v, selectordinal, one {1st} other {nth}}", "selectordinal"],
  ])("records %s", (_label, message, kind) => {
    expect(icuMessageArguments(message)).toEqual({
      valid: true,
      arguments: [{ name: "v", kinds: [kind], required: true }],
    });
  });

  it("records every distinct kind one name is formatted as, in document order", () => {
    expect(icuMessageArguments("{n, plural, other {{n, number} items}} {n}")).toEqual({
      valid: true,
      arguments: [{ name: "n", kinds: ["plural", "number", "argument"], required: true }],
    });
  });
});

describe("icuMessageArguments: arguments that only some branches use", () => {
  it("keeps an argument only one select branch uses, as optional", () => {
    expect(
      icuMessageArguments(
        "{gender, select, female {{name} invited you} other {Someone invited you}}",
      ),
    ).toEqual({
      valid: true,
      arguments: [
        { name: "gender", kinds: ["select"], required: true },
        { name: "name", kinds: ["argument"], required: false },
      ],
    });
  });

  it("keeps an argument only the plural other branch uses, as optional", () => {
    expect(icuMessageArguments("{count, plural, one {One item} other {{total} items}}")).toEqual({
      valid: true,
      arguments: [
        { name: "count", kinds: ["plural"], required: true },
        { name: "total", kinds: ["argument"], required: false },
      ],
    });
  });

  it("requires an argument every branch uses", () => {
    expect(
      icuMessageArguments("{count, plural, one {# by {author}} other {# by {author}}}"),
    ).toEqual({
      valid: true,
      arguments: [
        { name: "count", kinds: ["plural"], required: true },
        { name: "author", kinds: ["argument"], required: true },
      ],
    });
  });

  it("requires an argument a branch leaves out when the message also uses it outside the branch", () => {
    expect(icuMessageArguments("{g, select, a {{name}} other {x}} {name}")).toEqual({
      valid: true,
      arguments: [
        { name: "g", kinds: ["select"], required: true },
        { name: "name", kinds: ["argument"], required: true },
      ],
    });
  });

  it("collects the union through nested branches, optional wherever a path skips it", () => {
    expect(
      icuMessageArguments(
        "{a, select, x {{b, plural, one {{c}} other {{c} {d}}}} other {{e, date}}}",
      ),
    ).toEqual({
      valid: true,
      arguments: [
        { name: "a", kinds: ["select"], required: true },
        { name: "b", kinds: ["plural"], required: false },
        { name: "c", kinds: ["argument"], required: false },
        { name: "d", kinds: ["argument"], required: false },
        { name: "e", kinds: ["date"], required: false },
      ],
    });
  });

  it("requires a nested argument every path reaches", () => {
    expect(
      icuMessageArguments(
        "{a, select, x {{b, plural, one {{c}} other {{c}}}} other {{b, plural, other {{c}}}}}",
      ),
    ).toEqual({
      valid: true,
      arguments: [
        { name: "a", kinds: ["select"], required: true },
        { name: "b", kinds: ["plural"], required: true },
        { name: "c", kinds: ["argument"], required: true },
      ],
    });
  });

  it("reads arguments inside a tag as always rendered", () => {
    expect(icuMessageArguments("<b>{name}</b>")).toEqual({
      valid: true,
      arguments: [{ name: "name", kinds: ["argument"], required: true }],
    });
  });
});

describe("icuMessageArguments leaves the integrity analysis as it was", () => {
  it("still intersects branches for the integrity placeholders of the same message", () => {
    const message = "{gender, select, female {{name} invited you} other {Someone invited you}}";

    expect(analyzeIcuValue(message).placeholders).toEqual(["{gender}"]);
    expect(icuMessageArguments(message)).toMatchObject({
      arguments: [{ name: "gender" }, { name: "name", required: false }],
    });
  });
});
