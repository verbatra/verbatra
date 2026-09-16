import { describe, expect, it } from "vitest";
import { compareInlineMarkup } from "./inline-markup.js";

describe("compareInlineMarkup: a source with many tags is compared like any other", () => {
  const BREAKS = "<br>".repeat(257);

  it("refuses a tag invented beside more than 256 source tags", () => {
    const result = compareInlineMarkup(BREAKS, `${BREAKS}<img src=x onerror=alert(1)>`);
    expect(result.matches).toBe(false);
    expect(result.extra).toEqual(["<img onerror src>"]);
  });

  it("accepts such a source translated as itself", () => {
    expect(compareInlineMarkup(BREAKS, BREAKS).matches).toBe(true);
  });

  it("refuses dropping one of four hundred pairs", () => {
    const result = compareInlineMarkup("<b>x</b>".repeat(400), "<b>x</b>".repeat(399));
    expect(result.matches).toBe(false);
    expect(result.missing).toEqual(["</b>", "<b>"]);
  });
});

describe("compareInlineMarkup: the candidate ceiling grows with the source", () => {
  it("allows a candidate up to twice the source's tags and constructs", () => {
    const source = "<b>x</b>".repeat(200);
    const candidate = "<b>x</b>".repeat(400);
    const result = compareInlineMarkup(source, candidate);
    expect(result.tagLimitExceeded).toBeUndefined();
    expect(result.extra).toHaveLength(400);
  });

  it("refuses a candidate past twice the source's tags and constructs, naming that limit", () => {
    const source = "<b>x</b>".repeat(200);
    expect(compareInlineMarkup(source, `${"<b>x</b>".repeat(400)}<br>`)).toEqual({
      matches: false,
      missing: [],
      extra: [],
      malformed: false,
      tagLimitExceeded: 800,
    });
  });

  it("keeps 256 as the floor for a small source", () => {
    expect(compareInlineMarkup("<b>x</b>", `x${"<i></i>".repeat(200)}`).tagLimitExceeded).toBe(256);
  });
});

describe("compareInlineMarkup: comparison work stays proportional to the number of tags", () => {
  it.each([
    ["deeply nested pairs", `${"<b>".repeat(60_000)}x${"</b>".repeat(60_000)}`],
    ["unclosed openers", "<i>".repeat(120_000)],
    ["closing tags with no opener", `<b>x</b>${"</i>".repeat(120_000)}`],
  ])("compares %s promptly", (_label, value) => {
    const started = Date.now();
    expect(compareInlineMarkup(value, value).matches).toBe(true);
    expect(compareInlineMarkup("Hallo", value).matches).toBe(false);
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});
