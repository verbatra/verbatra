import { describe, expect, it } from "vitest";
import { MAX_TOML_NESTING, renderTomlTable, scanToml, type TomlStatement } from "./toml-text.js";

function values(text: string): Record<string, unknown> {
  const statements = scanToml(text);
  if (statements === undefined) {
    throw new Error("expected the text to scan");
  }
  return Object.fromEntries(
    statements.flatMap((statement: TomlStatement) =>
      statement.kind === "value" ? [[statement.path.join("."), statement.value]] : [],
    ),
  );
}

describe("scanToml", () => {
  it("reads headers, array tables and the table each key belongs to", () => {
    expect(scanToml('top = 1\n[a."b c"]\nk = 2\n[[list]]\nk = 3\n')).toEqual([
      { kind: "value", table: [], path: ["top"], value: 1 },
      { kind: "table", path: ["a", "b c"] },
      { kind: "value", table: ["a", "b c"], path: ["a", "b c", "k"], value: 2 },
      { kind: "array-table", path: ["list"] },
      { kind: "value", table: ["list"], path: ["list", "k"], value: 3 },
    ]);
  });

  it("normalises strings, numbers, booleans and arrays", () => {
    expect(
      values(
        [
          's = "a\\tb\\u00e9\\U0001F600\\e\\"\\\\"',
          "l = 'C:\\raw'",
          "i = 1_000",
          "f = -2.5e3",
          "b = false",
          "t = true",
          'a = [1, ["x", "y"], []]',
        ].join("\n"),
      ),
    ).toEqual({
      s: 'a\tb\u00e9\u{1F600}\u001b"\\',
      l: "C:\\raw",
      i: 1000,
      f: -2500,
      b: false,
      t: true,
      a: [1, ["x", "y"], []],
    });
  });

  it("keeps values it does not model as opaque text", () => {
    expect(
      values(
        [
          "d = 1979-05-27T07:32:00Z",
          "inline = { x = 1, y = [2] }",
          "empty = {}",
          'basic = """one ""quoted"" \\""" end"""""',
          "lit = '''it's'''''",
        ].join("\n"),
      ),
    ).toEqual({
      d: { raw: "1979-05-27T07:32:00Z" },
      inline: { raw: "{ x = 1, y = [2] }" },
      empty: { raw: "{}" },
      basic: { raw: '"""one ""quoted"" \\""" end"""""' },
      lit: { raw: "'''it's'''''" },
    });
  });

  it("skips a byte order mark, comments and CRLF line ends", () => {
    expect(values('\uFEFF# head\r\nk = "v" # tail\r\n\r\n')).toEqual({ k: "v" });
  });

  it.each([
    ["an unterminated basic string", 'k = "v\n'],
    ["an unterminated basic string at the end", 'k = "v'],
    ["an unterminated literal string", "k = 'v\n'"],
    ["an unterminated multi-line basic string", 'k = """v\n'],
    ["an unterminated multi-line literal string", "k = '''v\n"],
    ["an unterminated array", "k = [1, 2\n"],
    ["an array without commas", 'k = ["a" "b"]\n'],
    ["an unterminated inline table", "k = { a = 1\n"],
    ["an inline table without commas", 'k = { a = "1" b = 2 }\n'],
    ["an unknown escape", 'k = "\\q"\n'],
    ["a short unicode escape", 'k = "\\u12"\n'],
    ["an out-of-range unicode escape", 'k = "\\UFFFFFFFF"\n'],
    ["a key without a value", "k =\n"],
    ["a key without an equals sign", "k 1\n"],
    ["an empty key", "= 1\n"],
    ["two values on one line", 'k = "1" j = 2\n'],
    ["an unclosed header", "[a\n"],
    ["text after a header", "[a] b\n"],
    ["an unclosed array table header", "[[a]\n"],
  ])("refuses %s", (_label, text) => {
    expect(scanToml(text)).toBeUndefined();
  });

  it("reads arrays and inline tables nested up to the limit", () => {
    const deepest = `k = ${"[".repeat(MAX_TOML_NESTING)}${"]".repeat(MAX_TOML_NESTING)}\n`;
    expect(scanToml(deepest)).toHaveLength(1);
    const tables = `k = ${"{ a = ".repeat(MAX_TOML_NESTING - 1)}{}${" }".repeat(MAX_TOML_NESTING - 1)}\n`;
    expect(scanToml(tables)).toHaveLength(1);
  });

  it.each([
    ["arrays", `k = ${"[".repeat(MAX_TOML_NESTING + 1)}${"]".repeat(MAX_TOML_NESTING + 1)}\n`],
    [
      "inline tables",
      `k = ${"{ a = ".repeat(MAX_TOML_NESTING)}{}${" }".repeat(MAX_TOML_NESTING)}\n`,
    ],
    ["20,000 open arrays", `k = ${"[".repeat(20000)}\n`],
  ])("refuses %s nested past the limit instead of overflowing the stack", (_label, text) => {
    expect(scanToml(text)).toBeUndefined();
  });

  it("lets errors other than scan errors through", () => {
    expect(() => scanToml(undefined as unknown as string)).toThrow(TypeError);
  });
});

describe("renderTomlTable", () => {
  it("renders a header and one line per entry", () => {
    expect(renderTomlTable(["a", "b"], { s: "x", n: 2, l: ["p", "q"] }, "\r\n")).toBe(
      '[a.b]\r\ns = "x"\r\nn = 2\r\nl = ["p", "q"]\r\n',
    );
  });

  it.each([[true], [Number.NaN], [{}], [null]])("refuses to render %s", (value) => {
    expect(() => renderTomlTable(["a"], { value }, "\n")).toThrow(TypeError);
  });
});
