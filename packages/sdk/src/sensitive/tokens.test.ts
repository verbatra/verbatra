import { foreignPlaceholderTokens, SUPPORTED_FORMATS } from "@verbatra/core";
import { describe, expect, it } from "vitest";
import { selectAdapter } from "../selection/select-adapter.js";
import { redactionToken, redactValue, replaceSpans, restoreTokens } from "./tokens.js";

const VALUE = "Mail a@acme.io or b@acme.io";
const SPANS = [
  { start: 5, end: 14 },
  { start: 18, end: 27 },
];

describe("redactValue", () => {
  it("replaces each span with a numbered token and keeps the originals", () => {
    expect(redactValue(VALUE, SPANS, [])).toEqual({
      text: "Mail __VBR0__ or __VBR1__",
      tokens: ["__VBR0__", "__VBR1__"],
      originals: ["a@acme.io", "b@acme.io"],
    });
  });

  it("gives the same text twice two tokens, so each must come back once", () => {
    const value = "a@acme.io and a@acme.io";
    const redacted = redactValue(
      value,
      [
        { start: 0, end: 9 },
        { start: 14, end: 23 },
      ],
      [],
    );

    expect(redacted?.text).toBe("__VBR0__ and __VBR1__");
  });

  it("refuses a value that already holds a token, even as an existing placeholder", () => {
    expect(redactValue("Hi __VBR0__ a@acme.io", [{ start: 12, end: 21 }], ["__VBR0__"])).toBe(
      undefined,
    );
  });

  it("refuses a match that overlaps a placeholder", () => {
    const value = "Mail %(a@acme.io)s";

    expect(redactValue(value, [{ start: 7, end: 16 }], ["%(a@acme.io)s"])).toBe(undefined);
  });

  it("allows a match beside a placeholder", () => {
    const value = "Hi {{name}}, mail a@acme.io";

    expect(redactValue(value, [{ start: 18, end: 27 }], ["{{name}}", ""])?.text).toBe(
      "Hi {{name}}, mail __VBR0__",
    );
  });
});

describe("restoreTokens", () => {
  const originals = ["a@acme.io", "b@acme.io"];

  it("puts every original back byte for byte, in any order", () => {
    expect(restoreTokens("Schreib an __VBR1__ oder __VBR0__", originals)).toBe(
      "Schreib an b@acme.io oder a@acme.io",
    );
  });

  it("keeps a $ in an original literally", () => {
    expect(restoreTokens("x __VBR0__", ["$&$1"])).toBe("x $&$1");
  });

  it.each([
    ["a dropped token", "Schreib an __VBR0__"],
    ["a duplicated token", "__VBR0__ __VBR0__ __VBR1__"],
    ["an invented token", "__VBR0__ __VBR1__ __VBR2__"],
    ["a token swapped for another", "__VBR0__ __VBR0__"],
  ])("refuses %s", (_name, text) => {
    expect(restoreTokens(text, originals)).toBe(undefined);
  });

  it("restores nothing to restore", () => {
    expect(restoreTokens("Hallo", [])).toBe("Hallo");
  });
});

describe("replaceSpans", () => {
  it("leaves text without spans unchanged", () => {
    expect(replaceSpans("abc", [], () => "x")).toBe("abc");
  });
});

describe("the redaction token", () => {
  const value = `Hi ${redactionToken(0)} and ${redactionToken(12)} there`;

  it.each(SUPPORTED_FORMATS)("is not a placeholder in %s", (format) => {
    expect(selectAdapter(format).extractPlaceholders(value)).toEqual([]);
  });

  it("does not look like a placeholder of any other syntax", () => {
    expect(foreignPlaceholderTokens(value, [])).toEqual([]);
  });
});
