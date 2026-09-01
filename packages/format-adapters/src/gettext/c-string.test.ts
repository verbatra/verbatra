import { describe, expect, it } from "vitest";
import { AdapterError } from "../errors.js";
import { decodeCString, encodeCString } from "./c-string.js";

describe("decodeCString", () => {
  it("decodes the standard single-character escapes", () => {
    expect(decodeCString('a\\nb\\tc\\rd\\"e\\\\f', 1)).toBe('a\nb\tc\rd"e\\f');
  });

  it("decodes \\a \\b \\f \\v \\0", () => {
    expect(decodeCString("\\a\\b\\f\\v\\0", 1)).toBe("\x07\b\f\v\0");
  });

  it("decodes a \\xHH hex escape", () => {
    expect(decodeCString("caf\\x65", 1)).toBe("cafe");
  });

  it("decodes a bare \\x escape with a single hex digit", () => {
    expect(decodeCString("\\x9 tab", 1)).toBe("\t tab");
  });

  it("decodes an octal escape", () => {
    expect(decodeCString("\\101\\102\\103", 1)).toBe("ABC");
  });

  it("decodes a single-digit octal escape followed by ordinary text", () => {
    expect(decodeCString("\\7x", 1)).toBe("\x07x");
  });

  it("stops an octal escape at three digits even when a fourth digit follows", () => {
    expect(decodeCString("\\1014", 1)).toBe("A4");
  });

  it("decodes a two-digit hex escape at the exact two-digit boundary", () => {
    expect(decodeCString("\\x41x", 1)).toBe("Ax");
  });

  it("passes ordinary text through unchanged", () => {
    expect(decodeCString("plain text", 1)).toBe("plain text");
  });

  it("throws INVALID_STRUCTURE with a line number on a trailing backslash", () => {
    expect(() => decodeCString("broken\\", 7)).toThrow(AdapterError);
    try {
      decodeCString("broken\\", 7);
      throw new Error("expected a throw");
    } catch (error) {
      expect(error).toBeInstanceOf(AdapterError);
      expect((error as AdapterError).message).toContain("line 7");
    }
  });

  it("throws INVALID_STRUCTURE on an unknown escape", () => {
    expect(() => decodeCString("\\q", 3)).toThrow(/unknown escape/);
  });

  it("throws INVALID_STRUCTURE on a malformed \\x escape with no hex digits", () => {
    expect(() => decodeCString("\\xzz", 2)).toThrow(/malformed/);
  });
});

describe("encodeCString", () => {
  it("escapes backslash, double quote, and the common control characters", () => {
    expect(encodeCString('a\nb\tc\rd"e\\f')).toBe('a\\nb\\tc\\rd\\"e\\\\f');
  });

  it("hex-escapes other control characters below 0x20", () => {
    expect(encodeCString("\x01")).toBe("\\x01");
  });

  it("leaves ordinary and non-ASCII text untouched", () => {
    expect(encodeCString("cafe with accents: e a")).toBe("cafe with accents: e a");
  });

  it("round-trips arbitrary text through encode then decode", () => {
    const original = 'line one\nline "two"\tend\\';
    expect(decodeCString(encodeCString(original), 1)).toBe(original);
  });
});
