import { describe, expect, it } from "vitest";
import { isAttachedTail } from "./attached-tail.js";
import { parseAppleStringsEntries } from "./parse.js";

const REGEX_ORACLE = /^[ \t]*\r?\n?[ \t]*$/;
const ALPHABET = [" ", "\t", "\r", "\n", "x"] as const;

function allStrings(maxLength: number): string[] {
  const out: string[] = [""];
  let frontier: string[] = [""];
  for (let length = 1; length <= maxLength; length += 1) {
    frontier = frontier.flatMap((prefix) => ALPHABET.map((char) => prefix + char));
    out.push(...frontier);
  }
  return out;
}

function countCharacterReads<T>(run: () => T): { readonly result: T; readonly reads: number } {
  const { charCodeAt } = String.prototype;
  let reads = 0;
  String.prototype.charCodeAt = function (this: string, index: number): number {
    reads += 1;
    return charCodeAt.call(this, index);
  };
  try {
    return { result: run(), reads };
  } finally {
    String.prototype.charCodeAt = charCodeAt;
  }
}

describe("isAttachedTail: classification", () => {
  it.each([
    ["", true],
    ["\n", true],
    ["\r\n", true],
    ["\r", true],
    [" \t \n\t ", true],
    ["  \r\n  ", true],
    ["\t\t", true],
    ["\n\n", false],
    ["\r\n\r\n", false],
    ["\n\r", false],
    ["\r\r", false],
    [" \n \n", false],
    ["x", false],
    [" // note\n", false],
    ["\f", false],
    ["\v", false],
    ["\u00a0", false],
    ["\u2028", false],
    ["\u3000", false],
  ])("classifies %j as attached=%s", (tail, attached) => {
    expect(isAttachedTail(tail)).toBe(attached);
  });

  it("agrees with the former regular expression on every short string over the relevant alphabet", () => {
    const disagreements = allStrings(6).filter(
      (tail) => isAttachedTail(tail) !== REGEX_ORACLE.test(tail),
    );
    expect(disagreements).toEqual([]);
  });
});

describe("isAttachedTail: bounded work", () => {
  it.each([
    ["spaces followed by a rejected character", `${" ".repeat(100_000)}x`, false],
    [
      "tabs, a line break, tabs, then a rejected character",
      `${"\t".repeat(50_000)}\n${"\t".repeat(50_000)}x`,
      false,
    ],
    ["spaces around a second line break", `${" ".repeat(50_000)}\n${" ".repeat(50_000)}\n`, false],
    [
      "an accepted run of spaces around one line break",
      `${" ".repeat(50_000)}\r\n${" ".repeat(50_000)}`,
      true,
    ],
  ])("reads each character a constant number of times for %s", (_label, tail, attached) => {
    const { result, reads } = countCharacterReads(() => isAttachedTail(tail));
    expect(result).toBe(attached);
    expect(reads).toBeGreaterThanOrEqual(tail.length);
    expect(reads).toBeLessThanOrEqual(tail.length + 4);
  });
});

describe("parseAppleStringsEntries: bounded attachment work", () => {
  const run = " ".repeat(10_000);

  it.each([
    ["detached", `/* note */${run}x\n"a" = "1";\n`, run.length + 2, undefined],
    ["attached", `/* note */${run}\n${run}"a" = "1";\n`, run.length * 2 + 1, "note"],
  ])(
    "scans a long %s comment tail character by character",
    (_label, content, tailLength, description) => {
      const { result, reads } = countCharacterReads(() => parseAppleStringsEntries(content, "m"));
      expect(result.get("a")?.description).toBe(description);
      expect(reads).toBeGreaterThanOrEqual(tailLength);
      expect(reads).toBeLessThanOrEqual(content.length + 8);
    },
  );
});
