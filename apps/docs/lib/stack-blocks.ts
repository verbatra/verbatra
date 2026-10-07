import {
  CODE_TEXT_FIELDS,
  initCommand,
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
export const STACK_ONLY_COMPONENT = "StackOnly";
export const INIT_COMMAND_COMPONENT = "InitCommand";

const FORMAT_ID = /^[a-z0-9-]+$/;

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
  return (
    isElement(node, STACK_BLOCK_COMPONENT) ||
    isElement(node, STACK_TEXT_COMPONENT) ||
    isElement(node, STACK_ONLY_COMPONENT)
  );
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

function stackOnlyIds(node: StackMdxNode): string[] {
  const ids = (attribute(node, "stacks") ?? "").split(",").map((id) => id.trim());
  const unknown = ids.filter((id) => !isStackId(id));
  if (unknown.length > 0) {
    throw new Error(`<${STACK_ONLY_COMPONENT}> needs stacks="<id>,..." from known stack ids`);
  }
  return ids;
}

function stackOnlyNodes(stack: Stack, node: StackMdxNode): StackMdxNode[] {
  if (!stackOnlyIds(node).includes(stack.id)) return [];
  expandChildren(stack, node);
  return node.children ?? [];
}

function expanded(stack: Stack, node: StackMdxNode): StackMdxNode[] {
  if (isElement(node, STACK_BLOCK_COMPONENT)) return blockNodes(stack, node);
  if (isElement(node, STACK_ONLY_COMPONENT)) return stackOnlyNodes(stack, node);
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

function initCommandNode(node: StackMdxNode): StackMdxNode {
  const format = attribute(node, "format");
  if (format === undefined || !FORMAT_ID.test(format)) {
    throw new Error(`<${INIT_COMMAND_COMPONENT}> needs a format id, such as format="arb"`);
  }
  return { type: "code", lang: "bash", meta: null, value: initCommand(format) };
}

export function expandInitCommands(node: StackMdxNode): void {
  if (node.children === undefined) return;
  node.children = node.children.map((child) => {
    if (isElement(child, INIT_COMMAND_COMPONENT)) return initCommandNode(child);
    expandInitCommands(child);
    return child;
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
  expandInitCommands(root);
  const stack = pageStack(frontmatter);
  if (stack === undefined) {
    if (containsStackElement(root)) {
      throw new Error(
        `<${STACK_BLOCK_COMPONENT}>, <${STACK_TEXT_COMPONENT}> and <${STACK_ONLY_COMPONENT}> need a "stack" frontmatter field`,
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
