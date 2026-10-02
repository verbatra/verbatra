import { describe, expect, it } from "vitest";
import { type SensitiveRules, scanText } from "./scan-text.js";

const RULES: SensitiveRules = {
  detectors: ["email", "private-host"],
  patterns: [/Falcon/gu],
  allow: [],
};

function matched(rules: SensitiveRules, text: string): string[] {
  return scanText(rules, text).map((span) => text.slice(span.start, span.end));
}

describe("scanText", () => {
  it("returns nothing for empty text", () => {
    expect(scanText(RULES, "")).toEqual([]);
  });

  it("tags a configured pattern as pattern", () => {
    expect(scanText(RULES, "Project Falcon")).toEqual([
      { start: 8, end: 14, sources: ["pattern"] },
    ]);
  });

  it("merges overlapping matches of several detectors into one span", () => {
    const spans = scanText(RULES, "Mail ops@build.acme.internal now");

    expect(spans).toHaveLength(1);
    expect([...(spans[0]?.sources ?? [])].sort()).toEqual(["email", "private-host"]);
    expect(matched(RULES, "Mail ops@build.acme.internal now")).toEqual(["ops@build.acme.internal"]);
  });

  it("keeps separate matches apart, in text order", () => {
    expect(matched(RULES, "Falcon: a@acme.io, b@acme.io")).toEqual([
      "Falcon",
      "a@acme.io",
      "b@acme.io",
    ]);
  });

  it("drops a match the allow list covers, with * globs and ignoring case", () => {
    const rules: SensitiveRules = { ...RULES, allow: ["*@ACME.io", "falcon"] };

    expect(matched(rules, "Falcon: a@acme.io, b@other.io")).toEqual(["b@other.io"]);
  });

  it("runs only the detectors it is given", () => {
    expect(matched({ detectors: ["iban"], patterns: [], allow: [] }, "a@acme.io")).toEqual([]);
  });
});
