import { describe, expect, it } from "vitest";
import { formatCount, formatShortTimestamp, formatTimestamp, UI_LOCALE } from "./ui-format.js";

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

describe("formatShortTimestamp", () => {
  it("drops the year and keeps the day and time, in the English UI locale", () => {
    const iso = "2026-10-03T12:49:09.000Z";
    const expected = new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));

    expect(formatShortTimestamp(iso)).toBe(expected);
    expect(formatShortTimestamp(iso)).not.toContain("2026");
  });

  it("returns an unparseable value unchanged", () => {
    expect(formatShortTimestamp("not a date")).toBe("not a date");
  });
});

describe("formatCount", () => {
  it("groups thousands with a comma", () => {
    expect(formatCount(1234567)).toBe("1,234,567");
  });
});
