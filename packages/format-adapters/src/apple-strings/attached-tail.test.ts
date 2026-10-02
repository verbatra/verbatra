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

function countScannedCharacters<T>(run: () => T): {
  readonly result: T;
  readonly scanned: number;
} {
  const { charCodeAt, indexOf } = String.prototype;
  let scanned = 0;
  String.prototype.charCodeAt = function (this: string, index: number): number {
    scanned += 1;
    return charCodeAt.call(this, index);
  };
  String.prototype.indexOf = function (this: string, search: string, from = 0): number {
    const found = indexOf.call(this, search, from);
    scanned += (found === -1 ? this.length : found + search.length) - from;
    return found;
  };
  try {
    return { result: run(), scanned };
  } finally {
    String.prototype.charCodeAt = charCodeAt;
    String.prototype.indexOf = indexOf;
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
      expect(reads).toBeLessThanOrEqual(content.length * 2 + 8);
    },
  );
});

describe("parseAppleStringsEntries: block comments inside line comments", () => {
  it.each([
    [
      "a block comment quoted in a later line comment",
      '/* note */\n// see /* not a note */\n"a" = "1";\n',
      undefined,
    ],
    [
      "a block comment quoted in an earlier line comment",
      '// see /* not a note */\n/* note */\n"a" = "1";\n',
      "note",
    ],
    [
      "a line-comment marker inside a block comment",
      '/* note // still note */\n"a" = "1";\n',
      "note // still note",
    ],
    [
      "only a line comment quoting a block comment",
      '// see /* not a note */\n"a" = "1";\n',
      undefined,
    ],
    ["an unterminated block comment", '/* open\n"a" = "1";\n', undefined],
  ])(
    "takes the description from real block comments only, given %s",
    (_label, content, description) => {
      const entry = parseAppleStringsEntries(content, "m").get("a");
      expect(entry?.description).toBe(description);
    },
  );
});

describe("parseAppleStringsEntries: linear comment scan", () => {
  it.each([
    ["empty block comments before a trailing line comment", `${"/* */ ".repeat(20_000)}// x\n`],
    ["line comments before a trailing block comment", `${"// x\n".repeat(20_000)}/* note */ `],
    ["lone slashes between comments", `${"/ /* */ ".repeat(20_000)}// x\n`],
  ])("scans each character a bounded number of times for %s", (_label, leading) => {
    const content = `${leading}"a" = "1";\n`;
    const { result, scanned } = countScannedCharacters(() =>
      parseAppleStringsEntries(content, "m"),
    );
    expect(result.get("a")?.value).toBe("1");
    expect(scanned).toBeLessThanOrEqual(content.length * 4);
  });
});
