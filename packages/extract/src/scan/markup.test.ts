import { describe, expect, it } from "vitest";
import { readMarkup } from "./markup.js";
import { type PositionedToken, scanSource } from "./tokenize.js";

function scan(text: string) {
  return scanSource(text, { markup: readMarkup });
}

function describeToken(token: PositionedToken): string {
  switch (token.kind) {
    case "markup-open":
      return `<${token.name}>`;
    case "markup-close":
      return `</${token.name}>`;
    case "markup-attribute":
      return `@${token.name}`;
    case "markup-text":
      return `text:${token.value}`;
    case "dynamic":
      return "dynamic";
    default:
      return `${token.kind}:${token.value}`;
  }
}

function shape(text: string): readonly string[] {
  return scan(text).tokens.map(describeToken);
}

describe("readMarkup", () => {
  it("reads an element with a quoted attribute, text, and a closing tag", () => {
    expect(shape('x = <p title="Hi there">Hello</p>')).toEqual([
      "ident:x",
      "punct:=",
      "<p>",
      "@title",
      "string:Hi there",
      "text:Hello",
      "</p>",
    ]);
  });

  it("reads a braced attribute value and a braced child as ordinary tokens", () => {
    expect(shape("return <p a={b}>{c}</p>")).toEqual([
      "ident:return",
      "<p>",
      "@a",
      "punct:{",
      "ident:b",
      "punct:}",
      "punct:{",
      "ident:c",
      "punct:}",
      "</p>",
    ]);
  });

  it("reads a spread attribute, a valueless attribute, and a self-closing element", () => {
    expect(shape("(<Input {...rest} disabled />)")).toEqual([
      "punct:(",
      "<Input>",
      "@...",
      "punct:{",
      "punct:.",
      "punct:.",
      "punct:.",
      "ident:rest",
      "punct:}",
      "</Input>",
      "punct:)",
    ]);
  });

  it("reads a fragment and nested elements", () => {
    expect(shape("(<><b>x</b></>)")).toEqual([
      "punct:(",
      "<>",
      "<b>",
      "text:x",
      "</b>",
      "</>",
      "punct:)",
    ]);
  });

  it("keeps an apostrophe in text from opening a string", () => {
    expect(shape("(<p>Don't stop, won't stop</p>)")).toContain("text:Don't stop, won't stop");
  });

  it("reads an element nested inside a braced child expression", () => {
    expect(shape("(<ul>{xs.map((x) => <li>Item</li>)}</ul>)")).toContain("text:Item");
  });

  it("places text at its first non-blank character", () => {
    const text = scan("(<p>\n    Hello\n</p>)").tokens.find(
      (token) => token.kind === "markup-text",
    );

    expect(text).toMatchObject({ line: 2, column: 5 });
  });

  it("does not read a less-than comparison as markup", () => {
    expect(shape("a <b")).toEqual(["ident:a", "punct:<", "ident:b"]);
  });

  it("does not read a generic arrow function as markup", () => {
    expect(scan("const f = <T,>(x: T) => x;").truncated).toBe(false);
    expect(scan("const f = <T extends unknown>(x: T) => x;").truncated).toBe(false);
  });

  it("does not read an attribute with a bare value as markup", () => {
    const result = scan("x = <a b=1>");

    expect(result.truncated).toBe(false);
    expect(result.tokens.some((token) => token.kind === "markup-open")).toBe(false);
  });

  it("does not read a tag with a stray character as markup", () => {
    expect(scan("x = <a %>").tokens.some((token) => token.kind === "markup-open")).toBe(false);
  });
});

describe("readMarkup on markup it cannot read to the end", () => {
  it.each([
    ["an element that never closes", "(<p>Hello"],
    ["a tag that ends with the file", "(<p title"],
    ["a quoted attribute that never closes", '(<p title="Hi'],
    ["a braced attribute that never closes", "(<p title={x"],
    ["a spread attribute that never closes", "(<p {...x"],
    ["a braced child that never closes", "(<p>{x"],
    ["a malformed closing tag", "(<p>x</p x)"],
    ["a nested element that is not markup", "(<p><1</p>)"],
  ])("reads the text as code without truncating after %s", (_label, text) => {
    const result = scan(text);

    expect(result.truncated).toBe(false);
    expect(result.tokens.some((token) => token.kind === "markup-open")).toBe(false);
  });

  it("keeps reading the rest of the file once markup cannot be closed", () => {
    const result = scan('(<p>x</p x)\nconst after = "later";');

    expect(result.tokens).toContainEqual({ kind: "string", value: "later", line: 2, column: 15 });
  });

  it("does not read a closing tag with another name as the end of an element", () => {
    const result = scan("(<p>x</b>)");

    expect(result.truncated).toBe(false);
    expect(result.tokens.some((token) => token.kind === "markup-open")).toBe(false);
  });

  it("still reports truncation the tokenizer itself hits after backing out of markup", () => {
    expect(scan("(<p>{`open</p>)").truncated).toBe(true);
    expect(scan("(<p>{/* open</p>)").truncated).toBe(true);
  });

  it("does not read type arguments that never close as markup", () => {
    const result = scan("x = <List<Item");

    expect(result.truncated).toBe(false);
    expect(result.tokens.some((token) => token.kind === "markup-open")).toBe(false);
  });
});
