import {
  CODE_TEXT_FIELDS,
  isStackId,
  STACK_BLOCK_NAMES,
  STACK_TEXT_FIELDS,
  STACKS,
  type Stack,
  type StackBlockName,
  type StackTextField,
  stackBlock,
  stackText,
} from "./stacks";

export const STACK_BLOCK_COMPONENT = "StackBlock";
export const STACK_TEXT_COMPONENT = "StackText";

type MdxAttribute = { type: string; name?: string; value?: unknown };

export type StackMdxNode = {
  type: string;
  name?: string | null;
  attributes?: readonly MdxAttribute[];
  children?: StackMdxNode[];
  value?: string;
  lang?: string | null;
  meta?: string | null;
};

type StackFile = { data: object };

function attribute(node: StackMdxNode, name: string): string | undefined {
  const found = node.attributes?.find(
    (candidate) => candidate.type === "mdxJsxAttribute" && candidate.name === name,
  );
  return typeof found?.value === "string" ? found.value : undefined;
}

function isElement(node: StackMdxNode, name: string): boolean {
  return (
    (node.type === "mdxJsxFlowElement" || node.type === "mdxJsxTextElement") && node.name === name
  );
}

function isStackElement(node: StackMdxNode): boolean {
  return isElement(node, STACK_BLOCK_COMPONENT) || isElement(node, STACK_TEXT_COMPONENT);
}

function oneOf<T extends string>(values: readonly T[], value: string | undefined): T | undefined {
  return values.find((candidate) => candidate === value);
}

function blockNodes(stack: Stack, node: StackMdxNode): StackMdxNode[] {
  const name = oneOf<StackBlockName>(STACK_BLOCK_NAMES, attribute(node, "name"));
  if (name === undefined) {
    throw new Error(`<${STACK_BLOCK_COMPONENT}> needs a name from ${STACK_BLOCK_NAMES.join(", ")}`);
  }
  return stackBlock(stack, name).map(({ lang, title, code }) => ({
    type: "code",
    lang,
    meta: titleMeta(title),
    value: code,
  }));
}

export function titleMeta(title: string | undefined): string | null {
  if (title === undefined) return null;
  if (title.includes('"'))
    throw new Error(`A code block title cannot hold a double quote: ${title}`);
  return `title="${title}"`;
}

function textNode(stack: Stack, node: StackMdxNode): StackMdxNode {
  const field = oneOf<StackTextField>(STACK_TEXT_FIELDS, attribute(node, "field"));
  if (field === undefined) {
    throw new Error(`<${STACK_TEXT_COMPONENT}> needs a field from ${STACK_TEXT_FIELDS.join(", ")}`);
  }
  return {
    type: CODE_TEXT_FIELDS.has(field) ? "inlineCode" : "text",
    value: stackText(stack, field),
  };
}

function expanded(stack: Stack, node: StackMdxNode): StackMdxNode[] {
  if (isElement(node, STACK_BLOCK_COMPONENT)) return blockNodes(stack, node);
  return [textNode(stack, node)];
}

function expandChildren(stack: Stack, node: StackMdxNode): void {
  if (node.children === undefined) return;
  node.children = node.children.flatMap((child) => {
    if (isStackElement(child)) return expanded(stack, child);
    expandChildren(stack, child);
    return [child];
  });
}

function containsStackElement(node: StackMdxNode): boolean {
  return isStackElement(node) || (node.children ?? []).some(containsStackElement);
}

export function pageStack(frontmatter: unknown): Stack | undefined {
  if (typeof frontmatter !== "object" || frontmatter === null || !("stack" in frontmatter)) {
    return undefined;
  }
  const id = frontmatter.stack;
  if (!isStackId(id)) throw new Error(`Unknown stack "${String(id)}" in frontmatter`);
  return STACKS[id];
}

export function expandStackBlocks(root: StackMdxNode, frontmatter: unknown): void {
  const stack = pageStack(frontmatter);
  if (stack === undefined) {
    if (containsStackElement(root)) {
      throw new Error(
        `<${STACK_BLOCK_COMPONENT}> and <${STACK_TEXT_COMPONENT}> need a "stack" frontmatter field`,
      );
    }
    return;
  }
  expandChildren(stack, root);
}

export function remarkStackBlocks() {
  return (root: StackMdxNode, file: StackFile) =>
    expandStackBlocks(root, "frontmatter" in file.data ? file.data.frontmatter : undefined);
}
