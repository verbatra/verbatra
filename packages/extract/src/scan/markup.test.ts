// biome-ignore-all lint/suspicious/noTemplateCurlyInString: the fixtures are source text under test, not templates
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

  it("reads an element used as an attribute value", () => {
    expect(shape('x = <Foo icon=<Bar /> label="x">Inner copy</Foo>')).toEqual([
      "ident:x",
      "punct:=",
      "<Foo>",
      "@icon",
      "<Bar>",
      "</Bar>",
      "@label",
      "string:x",
      "text:Inner copy",
      "</Foo>",
    ]);
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
    expect(result.unreadableMarkup).toBe(false);
    expect(result.tokens.some((token) => token.kind === "markup-open")).toBe(false);
  });
});

describe("readMarkup on markup that makes the file unreadable", () => {
  it.each([
    ["return", "function f() { return <p>Never closed"],
    ["an arrow", "const f = () => <p>Never closed"],
    ["an opening parenthesis", "render(<p>Never closed"],
    ["an assignment", "const a = <p>Never closed"],
    ["a ternary question mark", "const a = ok ? <p>Never closed"],
    ["a ternary colon", "const a = ok ? null : <p>Never closed"],
    ["a logical and", "const a = ok && <p>Never closed"],
    ["a logical or", "const a = ok || <p>Never closed"],
    ["a comma", "render(a, <p>Never closed"],
    ["an assignment, in an unclosed tag", "const a = <p title"],
    ["an assignment, in an unclosed attribute", 'const a = <p title="Half typed'],
    ["an assignment, in an unclosed braced child", "const a = <p>{value"],
    ["an assignment, in an unclosed closing tag", "const a = <p>Text</p"],
    ["an assignment, for a nested element", "const a = <div><p>Never closed</p>"],
    ["an assignment, for a fragment", "const a = <>Never closed"],
  ])("flags an element after %s that reaches the end of the file", (_label, text) => {
    const result = scan(text);

    expect(result.unreadableMarkup).toBe(true);
    expect(result.truncated).toBe(false);
    expect(result.tokens).toContainEqual(expect.objectContaining({ kind: "punct", value: "<" }));
  });

  it("flags a closing tag that names an enclosing element mid-file", () => {
    const result = scan('const a = <div><span>Mid edit copy</div>;\nconst later = "kept";');

    expect(result.unreadableMarkup).toBe(true);
    expect(result.tokens).toContainEqual({ kind: "string", value: "kept", line: 2, column: 15 });
  });

  it.each([
    ["an element after another token", "const a = [<p>Never closed"],
    ["a closing tag for an element that is not open", "const a = (<p>x</b>);"],
    ["a malformed closing tag", "const a = (<p>x</p x);"],
    ["a tag with a stray character", "const a = <a %>"],
    ["a generic function type", "type Fn = <T>(x: T) => T;"],
    ["a generic function type with a modifier", "type Fn = <const T>(x: T) => T;"],
    ["a generic arrow function", "const f = <T,>(x: T) => x;"],
  ])("does not flag %s", (_label, text) => {
    expect(scan(text).unreadableMarkup).toBe(false);
  });

  it("flags an element that never closes inside a template expression", () => {
    expect(scan("const a = `${ok && <p>Never closed}`;").unreadableMarkup).toBe(true);
  });

  it("still flags broken markup that follows a generic function type", () => {
    expect(
      scan("type Fn = <T>(x: T) => T;\nconst a = <div><span>Mid edit copy</div>;").unreadableMarkup,
    ).toBe(true);
  });
});
