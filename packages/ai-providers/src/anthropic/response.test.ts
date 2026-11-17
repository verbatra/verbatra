import { describe, expect, it } from "vitest";
import { ProviderError } from "../errors.js";
import { readStructuredOutput } from "./response.js";

function text(value: string): readonly unknown[] {
  return [{ type: "text", text: value }];
}

function codeOf(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    return (error as ProviderError).code;
  }
  return undefined;
}

describe("readStructuredOutput", () => {
  it("parses the JSON held by the text block", () => {
    expect(readStructuredOutput(text('{"translations":[{"key":"a","value":"A"}]}'))).toEqual({
      translations: [{ key: "a", value: "A" }],
    });
  });

  it("skips a leading thinking block", () => {
    const content = [{ type: "thinking", thinking: "hmm", signature: "s" }, ...text('{"a":1}')];
    expect(readStructuredOutput(content)).toEqual({ a: 1 });
  });

  it("uses the first text block", () => {
    const content = [...text('{"a":1}'), ...text('{"a":2}')];
    expect(readStructuredOutput(content)).toEqual({ a: 1 });
  });

  it("rejects content with no text block", () => {
    const content = [{ type: "tool_use", id: "t", name: "x", input: {} }];
    expect(() => readStructuredOutput(content)).toThrow(ProviderError);
    expect(codeOf(() => readStructuredOutput(content))).toBe("INVALID_RESPONSE");
  });

  it("rejects an empty content array", () => {
    expect(codeOf(() => readStructuredOutput([]))).toBe("INVALID_RESPONSE");
  });

  it("rejects an empty text block", () => {
    expect(codeOf(() => readStructuredOutput(text("")))).toBe("INVALID_RESPONSE");
  });

  it("rejects a text block whose text is not a string", () => {
    expect(codeOf(() => readStructuredOutput([{ type: "text", text: 5 }]))).toBe(
      "INVALID_RESPONSE",
    );
  });

  it("rejects invalid JSON", () => {
    expect(codeOf(() => readStructuredOutput(text("here you go")))).toBe("INVALID_RESPONSE");
  });

  it("never echoes the model text in the error message", () => {
    try {
      readStructuredOutput(text("secret-sk-123 not json"));
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ProviderError);
      expect((error as ProviderError).message).not.toContain("secret-sk-123");
    }
  });
});
