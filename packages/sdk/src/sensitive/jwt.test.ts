import { describe, expect, it } from "vitest";
import { jwtSpans } from "./jwt.js";

const BACKTRACKING_JWT = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const PIECES = ["eyJ", "eyJabcdefgh.", "abcdefg", "a", ".", "-", " "];
const PIECE_COUNT = 6;

const b64url = (value: unknown): string => Buffer.from(JSON.stringify(value)).toString("base64url");

function* valuesOf(length: number): Generator<string> {
  if (length === 0) {
    yield "";
    return;
  }
  for (const rest of valuesOf(length - 1)) {
    for (const piece of PIECES) {
      yield piece + rest;
    }
  }
}

function backtrackingSpans(text: string): { start: number; end: number }[] {
  return [...text.matchAll(BACKTRACKING_JWT)].map((match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

describe("jwtSpans", () => {
  it("finds a header, payload and signature", () => {
    const token = [b64url({ alg: "HS256" }), b64url({ sub: "1234" }), "test-signature"].join(".");

    expect(jwtSpans(`Bearer ${token} end`)).toEqual([{ start: 7, end: 7 + token.length }]);
  });

  it("matches exactly what the backtracking pattern matched on every short value", () => {
    for (const value of valuesOf(PIECE_COUNT)) {
      expect(jwtSpans(value), value).toEqual(backtrackingSpans(value));
    }
  });
});
