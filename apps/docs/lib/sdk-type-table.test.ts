import { describe, expect, it } from "vitest";
import {
  readableType,
  remarkSdkTypeTable,
  remarkTypeTableMarkdown,
  SDK_DECLARATIONS,
  SDK_TYPE_TABLE_CLASS,
  typeTableMarkdown,
} from "@/lib/sdk-type-table";

type Node = {
  type: string;
  name?: string;
  attributes?: { type: string; name?: string; value?: unknown }[];
  children?: Node[];
  data?: Record<string, unknown>;
};

function flowElement(name: string, attributes: Node["attributes"] = []): Node {
  return { type: "mdxJsxFlowElement", name, attributes, children: [] };
}

const entry = {
  name: "locales",
  description: "Restrict the run.\nSee {@link translate}; `a | b` stays one cell.",
  type: "readonly string[] | undefined",
  simplifiedType: "array",
  tags: [],
  required: false,
  deprecated: false,
};

describe("remarkSdkTypeTable", () => {
  it("points an SdkTypeTable at the bundled SDK declarations, keeping its name", () => {
    const table = flowElement("SdkTypeTable", [
      { type: "mdxJsxAttribute", name: "name", value: "TranslateInput" },
      { type: "mdxJsxAttribute", name: "path", value: "elsewhere.ts" },
    ]);
    const root: Node = { type: "root", children: [{ type: "paragraph", children: [table] }] };

    remarkSdkTypeTable()(root);

    expect(table.name).toBe("auto-type-table");
    expect(table.attributes).toEqual([
      { type: "mdxJsxAttribute", name: "name", value: "TranslateInput" },
      { type: "mdxJsxAttribute", name: "path", value: SDK_DECLARATIONS },
      { type: "mdxJsxAttribute", name: "id", value: "sdk-TranslateInput" },
      { type: "mdxJsxAttribute", name: "className", value: SDK_TYPE_TABLE_CLASS },
    ]);
  });

  it("gives a type rendered twice on one page a distinct id, so row anchors stay unique", () => {
    const first = flowElement("SdkTypeTable", [
      { type: "mdxJsxAttribute", name: "name", value: "ReviewDecisionInput" },
    ]);
    const second = flowElement("SdkTypeTable", [
      { type: "mdxJsxAttribute", name: "name", value: "ReviewDecisionInput" },
    ]);

    remarkSdkTypeTable()({ type: "root", children: [first, second] });

    const idOf = (node: Node) => node.attributes?.find((attribute) => attribute.name === "id");
    expect(idOf(first)?.value).toBe("sdk-ReviewDecisionInput");
    expect(idOf(second)?.value).toBe("sdk-ReviewDecisionInput-2");
  });

  it("leaves every other element alone", () => {
    const other = flowElement("TypeTable");

    remarkSdkTypeTable()({ type: "root", children: [other] });

    expect(other).toEqual(flowElement("TypeTable"));
  });
});

describe("readableType", () => {
  it("drops the undefined an optional property adds, keeping a short type readable", () => {
    expect(readableType(entry)).toBe("readonly string[]");
    expect(readableType({ type: "boolean | undefined", required: true })).toBe(
      "boolean | undefined",
    );
  });

  it("gives up on a type too long for a table cell", () => {
    expect(readableType({ type: `{ ${"field: string; ".repeat(8)}}`, required: true })).toBe(
      undefined,
    );
  });
});

describe("typeTableMarkdown", () => {
  it("renders one table row per property, escaping pipes and folding lines", () => {
    expect(typeTableMarkdown({ entries: [entry] })).toBe(
      [
        "| Property | Type | Required | Description |",
        "| --- | --- | --- | --- |",
        "| `locales` | `readonly string[]` | no | Restrict the run. See translate; `a \\| b` stays one cell. |",
      ].join("\n"),
    );
  });
});

describe("remarkTypeTableMarkdown", () => {
  it("gives a generated TypeTable a Markdown table for the .md output", () => {
    const table = flowElement("TypeTable", [
      {
        type: "mdxJsxAttribute",
        name: "type",
        value: {
          type: "mdxJsxAttributeValueExpression",
          value: JSON.stringify({ entries: [entry] }),
        },
      },
    ]);

    remarkTypeTableMarkdown()({ type: "root", children: [table] });

    expect(table.data).toEqual({
      _stringify: { text: typeTableMarkdown({ entries: [entry] }) },
    });
  });

  it("leaves a TypeTable without generated data untouched", () => {
    const table = flowElement("TypeTable");

    remarkTypeTableMarkdown()({ type: "root", children: [table] });

    expect(table.data).toBeUndefined();
  });
});
