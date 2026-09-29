import { describe, expect, it } from "vitest";
import type { HastNode } from "./hast";
import { rehypeStackedTables, STACKED_TABLE_CLASS } from "./stacked-tables";

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
      table(["Flag", "Argument", "Default", "Effect"], [["--cwd", "<path>", "here", "resolve"]]),
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
    const wide = table(["A", "B", "C", "D"], [["1", "2", "3", "4", "5"]]);
    wide.properties = { className: ["existing"] };
    run(wide);

    expect(wide.properties?.className).toEqual(["existing", STACKED_TABLE_CLASS]);
    expect(cells(wide).at(-1)?.properties?.dataLabel).toBe("");
  });

  it("leaves narrow tables and tables without a header row alone", () => {
    const narrow = run(table(["Code", "Meaning", "Fix"], [["a", "b", "c"]]));
    const headless = run(element("table", [element("tbody", [])]));

    expect(narrow.properties?.className).toBeUndefined();
    expect(cells(narrow).every((cell) => cell.properties?.dataLabel === undefined)).toBe(true);
    expect(headless.properties?.className).toBeUndefined();
  });
});
