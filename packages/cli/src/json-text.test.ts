import { describe, expect, it } from "vitest";
import {
  appendMember,
  memberValueSpan,
  objectMembers,
  repeatedKey,
  rootObjectSpan,
} from "./json-text.js";

const LAYOUT = { unit: "  ", eol: "\n" };

function topLevelValue(text: string, key: string): string | undefined {
  const span = memberValueSpan(text, rootObjectSpan(text), key);
  return span === undefined ? undefined : text.slice(span.start, span.end);
}

describe("memberValueSpan", () => {
  const text = [
    "  {",
    '  "s": "a \\" } [ , b",',
    '  "n": -1.5e3 ,',
    '  "t": true,',
    '  "z": null,',
    '  "list": [1, {"servers": 2}, "]"],',
    '  "servers": { "x": { "y": [] } }',
    "}",
  ].join("\n");

  it.each([
    ["s", '"a \\" } [ , b"'],
    ["n", "-1.5e3"],
    ["t", "true"],
    ["z", "null"],
    ["list", '[1, {"servers": 2}, "]"]'],
    ["servers", '{ "x": { "y": [] } }'],
  ])("finds the top-level value of %s, skipping nested and quoted brackets", (key, value) => {
    expect(topLevelValue(text, key)).toBe(value);
  });

  it("returns undefined for a key that is only nested", () => {
    expect(topLevelValue(text, "x")).toBeUndefined();
    expect(topLevelValue("{}", "x")).toBeUndefined();
  });
});

describe("appendMember", () => {
  const member = { key: "k", value: { a: 1 } };

  it("appends after the last member, at the closing brace's indentation plus one unit", () => {
    const text = '{\n  "a": 1\n}\n';
    expect(appendMember(text, rootObjectSpan(text), member, LAYOUT)).toBe(
      '{\n  "a": 1,\n  "k": {\n    "a": 1\n  }\n}\n',
    );
  });

  it("opens an empty object that spans lines", () => {
    const text = "{\n}";
    expect(appendMember(text, rootObjectSpan(text), member, LAYOUT)).toBe(
      '{\n  "k": {\n    "a": 1\n  }\n}',
    );
  });

  it("gives up when the closing brace shares a line with a member", () => {
    const text = '{\n  "a": 1 }';
    expect(appendMember(text, rootObjectSpan(text), member, LAYOUT)).toBeUndefined();
  });
});

describe("objectMembers and repeatedKey", () => {
  it("lists the members of one object level in order, so a repeated key is found", () => {
    const text = '{ "a": 1, "b": { "a": 2 }, "a": 3 }';
    const members = objectMembers(text, rootObjectSpan(text));
    expect(members.map((member) => member.key)).toEqual(["a", "b", "a"]);
    expect(repeatedKey(members)).toBe("a");
    expect(repeatedKey(members.slice(0, 2))).toBeUndefined();
  });
});
