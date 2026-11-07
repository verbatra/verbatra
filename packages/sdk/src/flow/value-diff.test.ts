import { describe, expect, it } from "vitest";
import {
  diffValues,
  tokenizeValue,
  VALUE_DIFF_MAX_CELLS,
  VALUE_DIFF_MAX_CHARS,
} from "./value-diff.js";

function apply(segments: ReturnType<typeof diffValues>, side: "older" | "newer"): string {
  return segments
    .filter(
      (segment) =>
        segment.kind === "equal" || segment.kind === (side === "older" ? "removed" : "added"),
    )
    .map((segment) => segment.text)
    .join("");
}

describe("tokenizeValue", () => {
  it("keeps every placeholder shape whole", () => {
    const dollar = ["$", "{x}"].join("");
    const text = `Hi {name}, {{count}} ${dollar} %s %1$d %.2f %% <b>bold</b> <0/>`;

    expect(tokenizeValue(text).join("")).toBe(text);
    for (const placeholder of [
      "{name}",
      "{{count}}",
      dollar,
      "%s",
      "%1$d",
      "%.2f",
      "<b>",
      "</b>",
      "<0/>",
    ]) {
      expect(tokenizeValue(text)).toContain(placeholder);
    }
  });

  it("keeps length-modified printf, ruby and python-named placeholders whole", () => {
    const text = "%lld %llu %zd %hhd %{x} %(x)s";

    expect(tokenizeValue(text).filter((token) => token.trim() !== "")).toEqual([
      "%lld",
      "%llu",
      "%zd",
      "%hhd",
      "%{x}",
      "%(x)s",
    ]);
  });

  it("keeps the ICU plural head and a placeholder nested in its arms whole", () => {
    const text =
      "{count, plural, one {You have {n} item in your very long shopping basket} other {{n} items}}";

    const tokens = tokenizeValue(text);

    expect(tokens.join("")).toBe(text);
    expect(tokens).toContain("{n}");
    expect(tokens).toContain("{count, plural,");
    expect(tokens).not.toContain(text);
  });

  it("does not read a percent sign before a space as a placeholder", () => {
    expect(tokenizeValue("100% done")).toEqual(["100", "%", " ", "done"]);
  });

  it("splits an unbalanced or oversized brace into plain characters", () => {
    const long = `{${"a".repeat(101)}}`;

    expect(tokenizeValue("{open")).toEqual(["{", "open"]);
    expect(tokenizeValue(long)).toEqual(["{", "a".repeat(101), "}"]);
  });

  it("never splits a surrogate pair", () => {
    expect(tokenizeValue("a😀b")).toEqual(["a", "😀", "b"]);
  });

  it("tokenizes a hostile string in linear time", () => {
    const hostile = `${"{".repeat(50_000)}${"%".repeat(50_000)}${"<a".repeat(25_000)}`;
    const started = performance.now();

    const tokens = tokenizeValue(hostile);

    expect(tokens.join("")).toBe(hostile);
    expect(performance.now() - started).toBeLessThan(1500);
  });
});

describe("diffValues", () => {
  it("returns one equal segment for equal values and nothing for two empty values", () => {
    expect(diffValues("same", "same")).toEqual([{ kind: "equal", text: "same" }]);
    expect(diffValues("", "")).toEqual([]);
  });

  it("marks a changed word and keeps the rest equal", () => {
    expect(diffValues("Hello big world", "Hello small world")).toEqual([
      { kind: "equal", text: "Hello " },
      { kind: "removed", text: "big" },
      { kind: "added", text: "small" },
      { kind: "equal", text: " world" },
    ]);
  });

  it("shows the whole value as added when there is nothing before it", () => {
    expect(diffValues("", "Hallo")).toEqual([{ kind: "added", text: "Hallo" }]);
  });

  it("shows a change of whitespace alone as a change", () => {
    const segments = diffValues("a b", "a  b");

    expect(segments.some((segment) => segment.kind !== "equal")).toBe(true);
    expect(apply(segments, "older")).toBe("a b");
    expect(apply(segments, "newer")).toBe("a  b");
  });

  it("replaces a placeholder as a whole token", () => {
    expect(diffValues("Hi {name}!", "Hi {user}!")).toEqual([
      { kind: "equal", text: "Hi " },
      { kind: "removed", text: "{name}" },
      { kind: "added", text: "{user}" },
      { kind: "equal", text: "!" },
    ]);
  });

  it("rebuilds both sides exactly from the segments", () => {
    const pairs: [string, string][] = [
      ["one two three four", "one three two four five"],
      ["{a} {b} {c}", "{c} {b} {a}"],
      ["x", ""],
      ["", "y"],
      ["Köln ist 😀 schön", "Köln ist 😀 sehr schön"],
    ];

    for (const [older, newer] of pairs) {
      const segments = diffValues(older, newer);
      expect(apply(segments, "older")).toBe(older);
      expect(apply(segments, "newer")).toBe(newer);
    }
  });

  it("merges neighbouring segments of one kind", () => {
    const segments = diffValues("a b c", "x y z");

    for (let index = 1; index < segments.length; index += 1) {
      expect(segments[index]?.kind).not.toBe(segments[index - 1]?.kind);
    }
  });

  it("replaces only the differing middle once the table would exceed its cap", () => {
    const side = Math.ceil(Math.sqrt(VALUE_DIFF_MAX_CELLS)) + 10;
    const older = `start ${Array.from({ length: side }, (_, index) => `a${index}`).join(" ")} end`;
    const newer = `start ${Array.from({ length: side }, (_, index) => `b${index}`).join(" ")} end`;

    const segments = diffValues(older, newer);

    expect(segments).toEqual([
      { kind: "equal", text: "start " },
      { kind: "removed", text: older.slice(6, -4) },
      { kind: "added", text: newer.slice(6, -4) },
      { kind: "equal", text: " end" },
    ]);
  });

  it("replaces the whole value above the character cap without tokenizing it", () => {
    const older = "word ".repeat(4000);
    const newer = `${older}extra`;

    expect(VALUE_DIFF_MAX_CHARS).toBe(16_384);
    expect(older.length).toBe(20_000);
    expect(diffValues(older, newer)).toEqual([
      { kind: "removed", text: older },
      { kind: "added", text: newer },
    ]);
  });

  it("aligns the same two values once they fit under the character cap", () => {
    const older = "word ".repeat(100);

    expect(diffValues(older, `${older}extra`)).toEqual([
      { kind: "equal", text: older },
      { kind: "added", text: "extra" },
    ]);
  });

  it("diffs two values at the cap in bounded time", () => {
    const older = Array.from({ length: 2000 }, (_, index) => `w${index}`)
      .join(" ")
      .slice(0, VALUE_DIFF_MAX_CHARS);
    const newer = Array.from({ length: 2000 }, (_, index) => `v${index}`)
      .join(" ")
      .slice(0, VALUE_DIFF_MAX_CHARS);
    const started = performance.now();

    const segments = diffValues(older, newer);

    expect(apply(segments, "older")).toBe(older);
    expect(apply(segments, "newer")).toBe(newer);
    expect(performance.now() - started).toBeLessThan(1500);
  });
});
