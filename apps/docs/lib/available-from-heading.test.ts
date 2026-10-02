import { describe, expect, it } from "vitest";
import { rehypeAvailableFromInHeading } from "./available-from-heading";
import type { HastNode } from "./hast";

const badge = (version: string): HastNode => ({
  type: "mdxJsxFlowElement",
  name: "AvailableFrom",
  properties: { version },
  children: [],
});
const heading = (tagName: string, text: string): HastNode => ({
  type: "element",
  tagName,
  properties: { id: text },
  children: [{ type: "text", value: text }],
});
const newline: HastNode = { type: "text", value: "\n" };
const paragraph: HastNode = { type: "element", tagName: "p", children: [] };

function transform(children: HastNode[]): HastNode {
  const tree: HastNode = { type: "root", children };
  rehypeAvailableFromInHeading()(tree);
  return tree;
}

describe("rehypeAvailableFromInHeading", () => {
  it("moves the badge right after a section heading into that heading, as inline content", () => {
    const tree = transform([heading("h3", "translate"), newline, badge("0.12.0"), paragraph]);

    expect(tree.children).toHaveLength(2);
    const [moved, rest] = tree.children ?? [];
    expect(moved?.children).toEqual([
      { type: "text", value: "translate" },
      { type: "text", value: " " },
      { ...badge("0.12.0"), type: "mdxJsxTextElement" },
    ]);
    expect(rest).toBe(paragraph);
  });

  it("handles h2 and h4 and headings nested inside other blocks", () => {
    const step: HastNode = {
      type: "mdxJsxFlowElement",
      name: "Step",
      children: [heading("h4", "nested"), badge("0.11.0")],
    };
    const tree = transform([heading("h2", "top"), badge("0.10.0"), step]);

    expect(tree.children?.[0]?.children?.at(-1)?.type).toBe("mdxJsxTextElement");
    expect(step.children).toHaveLength(1);
    expect(step.children?.[0]?.children?.at(-1)?.type).toBe("mdxJsxTextElement");
  });

  it("leaves a badge that does not follow a heading where it is", () => {
    const tree = transform([paragraph, badge("0.12.0"), heading("h3", "later"), paragraph]);

    expect(tree.children?.[1]?.type).toBe("mdxJsxFlowElement");
    expect(tree.children?.[2]?.children).toHaveLength(1);
  });

  it("ignores page titles and other components after a heading", () => {
    const callout: HastNode = { type: "mdxJsxFlowElement", name: "Callout", children: [] };
    const tree = transform([heading("h1", "title"), badge("0.12.0"), heading("h3", "x"), callout]);

    expect(tree.children).toHaveLength(4);
  });
});
