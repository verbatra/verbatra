import { describe, expect, it } from "vitest";
import { AdapterError } from "../errors.js";
import { parseXcstringsDocument } from "../xcstrings/xcstrings-document.js";
import { parseOrderedJson } from "./ordered-json.js";
import { describePosition, jsonSyntaxPosition, positionAt } from "./syntax-position.js";

function thrown(action: () => unknown): AdapterError {
  try {
    action();
  } catch (error) {
    if (error instanceof AdapterError) {
      return error;
    }
    throw error;
  }
  throw new Error("expected an AdapterError");
}

describe("positionAt", () => {
  it("counts lines and columns from 1", () => {
    expect(positionAt("ab\ncd", 0)).toEqual({ line: 1, column: 1 });
    expect(positionAt("ab\ncd", 4)).toEqual({ line: 2, column: 2 });
  });

  it("clamps an offset outside the content", () => {
    expect(positionAt("ab", 99)).toEqual({ line: 1, column: 3 });
    expect(positionAt("ab", -1)).toEqual({ line: 1, column: 1 });
  });
});

describe("jsonSyntaxPosition", () => {
  it("is undefined for valid JSON", () => {
    expect(jsonSyntaxPosition('{"a": 1}')).toBeUndefined();
  });

  it("locates a missing comma on its own line", () => {
    expect(jsonSyntaxPosition('{\n  "a": "x"\n  "b": "y"\n}')).toEqual({ line: 3, column: 3 });
  });

  it("locates a truncated file at its end", () => {
    expect(jsonSyntaxPosition('{\n  "a": ')).toEqual({ line: 2, column: 8 });
  });

  it("leaves the position out when the parser names none", () => {
    expect(jsonSyntaxPosition('{"a": x}')).toBeUndefined();
  });
});

describe("describePosition", () => {
  it("keeps a message as it is without a position", () => {
    expect(describePosition("Bad.", undefined)).toBe("Bad.");
  });

  it("puts the position before the closing period, or appends it", () => {
    expect(describePosition("Bad.", { line: 2, column: 5 })).toBe("Bad (line 2, column 5).");
    expect(describePosition("Bad", { line: 2, column: 5 })).toBe("Bad (line 2, column 5)");
  });
});

describe("malformed JSON carries its position on the adapter error", () => {
  it("in a locale tree", () => {
    const error = thrown(() => parseOrderedJson('{\n  "a": "x",\n}'));
    expect(error.code).toBe("INVALID_JSON");
    expect(error.position).toEqual({ line: 3, column: 1 });
    expect(error.message).toBe("The file is not valid JSON (line 3, column 1).");
  });

  it("in an xcstrings catalogue", () => {
    const error = thrown(() => parseXcstringsDocument('{"a": 1,}', "Localizable.xcstrings"));
    expect(error.position).toEqual({ line: 1, column: 9 });
  });

  it("stays unlocated when the parser gives no offset", () => {
    const error = thrown(() => parseOrderedJson('{"a": x}'));
    expect(error.position).toBeUndefined();
    expect(error.message).toBe("The file is not valid JSON.");
  });
});
