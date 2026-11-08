import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  COMMIT_AUTHOR_MAX_CHARS,
  COMMIT_SUBJECT_MAX_CHARS,
  FIELD_SEPARATOR,
  parseGitLogOutput,
} from "./git-log.js";

const HASH = "a".repeat(40);
const DATE = "2026-01-02T03:04:05+00:00";
const ENV_KEY = `lt-${"Q7x9".repeat(15)}`;
const PATTERN_KEY = `sk-${"a1B2c3D4".repeat(5)}`;

function header(author: string, subject: string): string {
  return [HASH, DATE, author, subject].join(FIELD_SEPARATOR);
}

function parseCommitHeader(line: string) {
  return parseGitLogOutput(line)[0];
}

let previous: string | undefined;

beforeEach(() => {
  previous = process.env.LIBRETRANSLATE_API_KEY;
  process.env.LIBRETRANSLATE_API_KEY = ENV_KEY;
});

afterEach(() => {
  if (previous === undefined) {
    delete process.env.LIBRETRANSLATE_API_KEY;
  } else {
    process.env.LIBRETRANSLATE_API_KEY = previous;
  }
});

function offsets(cap: number, keyLength: number): number[] {
  const list: number[] = [];
  for (let offset = Math.max(0, cap - keyLength - 3); offset <= cap + 3; offset += 1) {
    list.push(offset);
  }
  return list;
}

function hasKeyFragment(text: string, key: string): boolean {
  return text.includes(key.slice(0, 12)) || text.includes(key.slice(-12));
}

describe.each([
  ["configured environment key", ENV_KEY],
  ["key shaped like a provider key", PATTERN_KEY],
])("a %s that straddles the cut", (_name, key) => {
  it.each(offsets(COMMIT_SUBJECT_MAX_CHARS, key.length))(
    "leaves no part of it in the subject at offset %i",
    (offset) => {
      const subject = `${"x".repeat(offset)} ${key} tail`;

      const parsed = parseCommitHeader(header("Ada", subject));

      expect(parsed?.subject.length).toBeLessThanOrEqual(COMMIT_SUBJECT_MAX_CHARS);
      expect(hasKeyFragment(parsed?.subject ?? "", key)).toBe(false);
      expect(parsed?.subject.includes("lt-Q7x9") || parsed?.subject.includes("sk-a1B2")).toBe(
        false,
      );
    },
  );

  it.each(offsets(COMMIT_AUTHOR_MAX_CHARS, key.length))(
    "leaves no part of it in the author at offset %i",
    (offset) => {
      const author = `${"y".repeat(offset)} ${key} tail`;

      const parsed = parseCommitHeader(header(author, "subject"));

      expect(parsed?.author.length).toBeLessThanOrEqual(COMMIT_AUTHOR_MAX_CHARS);
      expect(hasKeyFragment(parsed?.author ?? "", key)).toBe(false);
      expect(parsed?.author.includes("lt-Q7x9") || parsed?.author.includes("sk-a1B2")).toBe(false);
    },
  );
});

const PADS = [16_384, 16_380, 16_300, 20_000];

describe.each([
  ["configured environment key", ENV_KEY],
  ["key shaped like a provider key", PATTERN_KEY],
])("a %s behind bidirectional padding", (_name, key) => {
  it.each(PADS)("is scrubbed from a subject padded with %i override characters", (pad) => {
    const parsed = parseCommitHeader(header("Ada", `${"\u202E".repeat(pad)} ${key} tail`));

    expect(parsed?.subject.includes("lt-Q7x9") || parsed?.subject.includes("sk-a1B2")).toBe(false);
    expect(parsed?.subject).toContain("[REDACTED]");
  });

  it.each(PADS)("is scrubbed from an author padded with %i override characters", (pad) => {
    const parsed = parseCommitHeader(header(`${"\u202E".repeat(pad)} ${key} tail`, "subject"));

    expect(parsed?.author.includes("lt-Q7x9") || parsed?.author.includes("sk-a1B2")).toBe(false);
    expect(parsed?.author).toContain("[REDACTED]");
  });
});

describe("scrubbing a very long commit message", () => {
  it("bounds the work and the result for a huge subject", () => {
    const subject = `${"z".repeat(2_000_005)}`;

    const started = Date.now();
    const parsed = parseCommitHeader(header("Ada", subject));

    expect(parsed?.subject).toHaveLength(COMMIT_SUBJECT_MAX_CHARS);
    expect(Date.now() - started).toBeLessThan(1000);
  });

  it("does not cut a surrogate pair in half", () => {
    const parsed = parseCommitHeader(
      header("Ada", `${"a".repeat(COMMIT_SUBJECT_MAX_CHARS - 1)}😀`),
    );

    expect(parsed?.subject).toHaveLength(COMMIT_SUBJECT_MAX_CHARS - 1);
  });

  it("scrubs a key that sits far beyond the cut", () => {
    const parsed = parseCommitHeader(header("Ada", `${"a".repeat(20_000)}${PATTERN_KEY}`));

    expect(parsed?.subject.includes("sk-")).toBe(false);
  });
});
