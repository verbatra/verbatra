import { describe, expect, it } from "vitest";
import { expandStackBlocks, remarkStackBlocks, type StackMdxNode } from "./stack-blocks";
import { STACK_BLOCK_NAMES, STACK_IDS, STACKS, stackInitCommand } from "./stacks";

function element(
  type: "mdxJsxFlowElement" | "mdxJsxTextElement",
  name: string,
  attributes: Record<string, string>,
): StackMdxNode {
  return {
    type,
    name,
    attributes: Object.entries(attributes).map(([key, value]) => ({
      type: "mdxJsxAttribute",
      name: key,
      value,
    })),
    children: [],
  };
}

function page(): StackMdxNode {
  return {
    type: "root",
    children: [
      {
        type: "paragraph",
        children: [
          { type: "text", value: "Your " },
          element("mdxJsxTextElement", "StackText", { field: "name" }),
          { type: "text", value: " app reads " },
          element("mdxJsxTextElement", "StackText", { field: "sourceFile" }),
        ],
      },
      {
        type: "mdxJsxFlowElement",
        name: "Steps",
        children: [element("mdxJsxFlowElement", "StackBlock", { name: "init" })],
      },
    ],
  };
}

function nodeTypes(node: StackMdxNode): string[] {
  return [node.type, ...(node.children ?? []).flatMap(nodeTypes)];
}

describe("expandStackBlocks", () => {
  it("expands a text field in place and a block into fenced code, nested in a component", () => {
    const root = page();
    expandStackBlocks(root, { stack: "react" });
    expect(root.children?.[0]?.children).toEqual([
      { type: "text", value: "Your " },
      { type: "text", value: "React" },
      { type: "text", value: " app reads " },
      { type: "inlineCode", value: "locales/en.json" },
    ]);
    expect(root.children?.[1]?.children).toEqual([
      { type: "code", lang: "bash", meta: null, value: stackInitCommand(STACKS.react) },
    ]);
  });

  it("titles a file block with its path, so the code block is file-labelled", () => {
    const root: StackMdxNode = {
      type: "root",
      children: [element("mdxJsxFlowElement", "StackBlock", { name: "source-file" })],
    };
    expandStackBlocks(root, { stack: "flutter" });
    expect(root.children?.[0]).toMatchObject({
      type: "code",
      lang: "json",
      meta: 'title="lib/l10n/app_en.arb"',
    });
  });

  it.each(STACK_IDS)("never emits a heading for %s, so the TOC stays the template's", (id) => {
    const root: StackMdxNode = {
      type: "root",
      children: STACK_BLOCK_NAMES.map((name) =>
        element("mdxJsxFlowElement", "StackBlock", { name }),
      ),
    };
    expandStackBlocks(root, { stack: id });
    expect(nodeTypes(root).filter((type) => type !== "root" && type !== "code")).toEqual([]);
  });

  it("leaves a page without a stack field and without stack elements untouched", () => {
    const root: StackMdxNode = { type: "root", children: [{ type: "text", value: "x" }] };
    expandStackBlocks(root, { title: "Page" });
    expect(root).toEqual({ type: "root", children: [{ type: "text", value: "x" }] });
  });

  it("refuses a stack element on a page that names no stack", () => {
    expect(() => expandStackBlocks(page(), { title: "Page" })).toThrow(/"stack" frontmatter/);
  });

  it("refuses an unknown stack, block name or text field", () => {
    expect(() => expandStackBlocks(page(), { stack: "svelte" })).toThrow(/Unknown stack/);
    const badBlock: StackMdxNode = {
      type: "root",
      children: [element("mdxJsxFlowElement", "StackBlock", { name: "nope" })],
    };
    expect(() => expandStackBlocks(badBlock, { stack: "vue" })).toThrow(/needs a name/);
    const badText: StackMdxNode = {
      type: "root",
      children: [element("mdxJsxTextElement", "StackText", { field: "nope" })],
    };
    expect(() => expandStackBlocks(badText, { stack: "vue" })).toThrow(/needs a field/);
  });

  it("reads the stack from the frontmatter fumadocs-mdx puts on the file", () => {
    const root = page();
    remarkStackBlocks()(root, { data: { frontmatter: { stack: "nextjs" } } });
    expect(root.children?.[0]?.children?.[1]).toEqual({ type: "text", value: "Next.js" });
  });
});
