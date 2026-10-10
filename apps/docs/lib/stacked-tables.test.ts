import { describe, expect, it } from "vitest";
import type { HastNode } from "./hast";
import {
  COMPACT_ROW_MAX_CHARACTERS,
  rehypeStackedTables,
  STACKED_TABLE_CLASS,
  WIDE_TABLE_CLASS,
} from "./stacked-tables";

const LONG = "start the config search here and resolve the paths you pass against it";

const text = (value: string): HastNode => ({ type: "text", value });
const element = (tagName: string, children: HastNode[], properties = {}): HastNode => ({
  type: "element",
  tagName,
  properties,
  children,
});

function table(headers: string[], rows: string[][]): HastNode {
  const headerCells = headers.map((header) =>
    element("th", [element("code", [text(header)]), text(" ")]),
  );
  return element("table", [
    element("thead", [element("tr", headerCells)]),
    text("\n"),
    element("tbody", [
      ...rows.map((row) =>
        element(
          "tr",
          row.map((cell) => element("td", [text(cell)])),
        ),
      ),
    ]),
  ]);
}

function run(node: HastNode): HastNode {
  rehypeStackedTables()({ type: "root", children: [element("div", [node])] });
  return node;
}

function cells(node: HastNode): HastNode[] {
  return (node.children?.[2]?.children ?? []).flatMap((row) => row.children ?? []);
}

describe("rehypeStackedTables", () => {
  it("labels every body cell of a wide table with its column header", () => {
    const wide = run(
      table(["Flag", "Argument", "Default", "Effect"], [["--cwd", "<path>", "here", LONG]]),
    );

    expect(wide.properties?.className).toEqual([STACKED_TABLE_CLASS]);
    expect(cells(wide).map((cell) => cell.properties?.dataLabel)).toEqual([
      "Flag",
      "Argument",
      "Default",
      "Effect",
    ]);
  });

  it("keeps existing classes and tolerates a row longer than the header", () => {
    const wide = table(["A", "B", "C", "D"], [["1", "2", "3", LONG, "5"]]);
    wide.properties = { className: ["existing"] };
    run(wide);

    expect(wide.properties?.className).toEqual(["existing", STACKED_TABLE_CLASS]);
    expect(cells(wide).at(-1)?.properties?.dataLabel).toBe("");
  });

  it("stacks a three-column table", () => {
    const three = run(table(["Code", "Meaning", "Fix"], [["a", "b", LONG]]));

    expect(three.properties?.className).toEqual([STACKED_TABLE_CLASS]);
    expect(cells(three).map((cell) => cell.properties?.dataLabel)).toEqual([
      "Code",
      "Meaning",
      "Fix",
    ]);
  });

  it("marks a table of six columns as wide, since it cannot fit the desktop article column", () => {
    const formats = run(
      table(
        ["format", "Files", "Placeholders", "Plurals", "Missing", "Native"],
        [["a", "b", "c", "d", "e", LONG]],
      ),
    );
    const flags = run(
      table(
        ["Flag", "Argument", "Default", "Effect", "Not accepted by"],
        [["a", "b", "c", LONG, "e"]],
      ),
    );

    expect(formats.properties?.className).toEqual([STACKED_TABLE_CLASS, WIDE_TABLE_CLASS]);
    expect(flags.properties?.className).toEqual([STACKED_TABLE_CLASS]);
  });

  it("keeps a table whose rows are all short as a table, like the error code index", () => {
    const index = run(
      table(
        ["Code", "Family", "Exit code"],
        [
          ["TRANSLATION_ORPHAN_REFUSED", "Provider", "1"],
          ["CLI_ERROR", "CLI", "2"],
        ],
      ),
    );
    const longer = run(
      table(["Code", "Family", "Exit code"], [["a".repeat(COMPACT_ROW_MAX_CHARACTERS), "b", "c"]]),
    );

    expect(index.properties?.className).toBeUndefined();
    expect(longer.properties?.className).toEqual([STACKED_TABLE_CLASS]);
  });

  it("leaves narrow tables and tables without a header row alone", () => {
    const narrow = run(table(["Code", "Meaning"], [["a", "b"]]));
    const headless = run(element("table", [element("tbody", [])]));

    expect(narrow.properties?.className).toBeUndefined();
    expect(cells(narrow).every((cell) => cell.properties?.dataLabel === undefined)).toBe(true);
    expect(headless.properties?.className).toBeUndefined();
  });
});
