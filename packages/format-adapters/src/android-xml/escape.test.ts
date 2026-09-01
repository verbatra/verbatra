import { describe, expect, it } from "vitest";
import { AdapterError } from "../errors.js";
import { decodeAndroidEscapes, encodeAndroidEscapes } from "./escape.js";

describe("decodeAndroidEscapes", () => {
  it("decodes an escaped apostrophe", () => {
    expect(decodeAndroidEscapes("Don\\'t")).toBe("Don't");
  });

  it("decodes an escaped double quote", () => {
    expect(decodeAndroidEscapes('say \\"hi\\"')).toBe('say "hi"');
  });

  it("decodes a newline and a tab escape", () => {
    expect(decodeAndroidEscapes("a\\nb\\tc")).toBe("a\nb\tc");
  });

  it("decodes an escaped backslash", () => {
    expect(decodeAndroidEscapes("a\\\\b")).toBe("a\\b");
  });

  it("decodes a leading escaped @ and ?", () => {
    expect(decodeAndroidEscapes("\\@string/ref")).toBe("@string/ref");
    expect(decodeAndroidEscapes("\\?attr/ref")).toBe("?attr/ref");
  });

  it("decodes a \\uXXXX unicode escape", () => {
    expect(decodeAndroidEscapes("\\u00e9")).toBe("\u00e9");
  });

  it("throws INVALID_STRUCTURE for a malformed unicode escape", () => {
    expect(() => decodeAndroidEscapes("\\u12")).toThrow(AdapterError);
    try {
      decodeAndroidEscapes("\\u12zz");
    } catch (error) {
      expect((error as AdapterError).code).toBe("INVALID_STRUCTURE");
    }
  });

  it("drops a dangling trailing backslash", () => {
    expect(decodeAndroidEscapes("abc\\")).toBe("abc");
  });

  it("leaves an unknown escape's character as-is", () => {
    expect(decodeAndroidEscapes("a\\zb")).toBe("azb");
  });

  it("decodes a large escaped value in bounded time (algorithmic-DoS guard)", () => {
    const value = "a\\\\".repeat(200_000);
    const start = performance.now();
    const result = decodeAndroidEscapes(value);
    const elapsed = performance.now() - start;
    expect(result).toBe("a\\".repeat(200_000));
    expect(elapsed).toBeLessThan(2000);
  });
});

describe("encodeAndroidEscapes", () => {
  it("escapes an apostrophe, double quote, and backslash", () => {
    expect(encodeAndroidEscapes(`it's "cool" \\`)).toBe(`it\\'s \\"cool\\" \\\\`);
  });

  it("escapes a newline and a tab", () => {
    expect(encodeAndroidEscapes("a\nb\tc")).toBe("a\\nb\\tc");
  });

  it("escapes a leading @ but leaves a non-leading @ untouched", () => {
    expect(encodeAndroidEscapes("@string/x")).toBe("\\@string/x");
    expect(encodeAndroidEscapes("user@example.com")).toBe("user@example.com");
  });

  it("escapes a leading ? but leaves a non-leading ? untouched", () => {
    expect(encodeAndroidEscapes("?attr/x")).toBe("\\?attr/x");
    expect(encodeAndroidEscapes("really?")).toBe("really?");
  });

  it("round-trips through decode after encode", () => {
    const original = `Hello "world", it's @you? \n\t\\end`;
    expect(decodeAndroidEscapes(encodeAndroidEscapes(original))).toBe(original);
  });

  it("encodes a large value in bounded time (algorithmic-DoS guard)", () => {
    const value = "a'b\"c\\d".repeat(200_000);
    const start = performance.now();
    const result = encodeAndroidEscapes(value);
    const elapsed = performance.now() - start;
    expect(result.length).toBeGreaterThan(value.length);
    expect(elapsed).toBeLessThan(2000);
  });
});
