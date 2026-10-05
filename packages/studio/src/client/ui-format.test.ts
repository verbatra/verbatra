import { describe, expect, it } from "vitest";
import { formatCount, formatTimestamp, UI_LOCALE } from "./ui-format.js";

describe("formatTimestamp", () => {
  it("formats in the English UI locale whatever the browser's locale", () => {
    const iso = "2026-10-03T00:49:09.000Z";
    const expected = new Intl.DateTimeFormat("en", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(iso));

    expect(UI_LOCALE).toBe("en");
    expect(formatTimestamp(iso)).toBe(expected);
    expect(formatTimestamp(iso)).toMatch(/^Oct \d+, 2026/);
  });

  it("returns an unparseable value unchanged", () => {
    expect(formatTimestamp("not a date")).toBe("not a date");
  });
});

describe("formatCount", () => {
  it("groups thousands with a comma", () => {
    expect(formatCount(1234567)).toBe("1,234,567");
  });
});
