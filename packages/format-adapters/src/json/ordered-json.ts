import { AdapterError } from "../errors.js";
import { MAX_DEPTH } from "./limits.js";

/** A value in a locale tree about to be serialized, with key order preserved at every level. */
export type OrderedValue =
  | string
  | number
  | boolean
  | null
  | OrderedRecord
  | readonly OrderedValue[];

/** A locale tree about to be serialized, keyed in the order it will be written out. */
export type OrderedRecord = ReadonlyMap<string, OrderedValue>;

const SENTINEL_ESCAPE = "\\u0001";

function isJsonWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\n" || char === "\r";
}

function endOfStringToken(content: string, openQuote: number): number {
  let index = openQuote + 1;
  while (index < content.length) {
    const char = content[index];
    if (char === "\\") {
      index += 2;
    } else if (char === '"') {
      return index + 1;
    } else {
      index += 1;
    }
  }
  return index;
}

function isKeyToken(content: string, end: number): boolean {
  let index = end;
  while (isJsonWhitespace(content[index])) {
    index += 1;
  }
  return content[index] === ":";
}

function prefixKeyToken(token: string): string {
  if (token.includes(SENTINEL_ESCAPE)) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      "A key contains a reserved control-character escape.",
    );
  }
  return `"${SENTINEL_ESCAPE}${token.slice(1)}`;
}

function prefixKeyTokens(content: string): string {
  let out = "";
  let index = 0;
  while (index < content.length) {
    const openQuote = content.indexOf('"', index);
    if (openQuote === -1) {
      return out + content.slice(index);
    }
    const end = endOfStringToken(content, openQuote);
    const token = content.slice(openQuote, end);
    out += content.slice(index, openQuote);
    out += isKeyToken(content, end) ? prefixKeyToken(token) : token;
    index = end;
  }
  return out;
}

function childrenOf(node: unknown): Iterable<unknown> | null {
  if (node instanceof Map) {
    return node.values();
  }
  if (Array.isArray(node)) {
    return node;
  }
  if (typeof node === "object" && node !== null) {
    return Object.values(node);
  }
  return null;
}

export function assertWithinDepth(value: unknown, max: number): void {
  const stack: Array<{ node: unknown; depth: number }> = [{ node: value, depth: 1 }];
  while (stack.length > 0) {
    const top = stack.pop();
    if (top === undefined) {
      break;
    }
    const children = childrenOf(top.node);
    if (children === null) {
      continue;
    }
    if (top.depth > max) {
      throw new AdapterError("MAX_DEPTH_EXCEEDED", "The file nests objects too deeply.");
    }
    for (const child of children) {
      stack.push({ node: child, depth: top.depth + 1 });
    }
  }
}

function toOrdered(node: unknown): OrderedValue {
  if (Array.isArray(node)) {
    return node.map((child) => toOrdered(child));
  }
  if (typeof node === "object" && node !== null) {
    const out = new Map<string, OrderedValue>();
    for (const [key, child] of Object.entries(node)) {
      out.set(key.slice(1), toOrdered(child));
    }
    return out;
  }
  return node as string | number | boolean | null;
}

export function parseOrderedJson(content: string): OrderedValue {
  const prefixed = prefixKeyTokens(content);
  let parsed: unknown;
  try {
    parsed = JSON.parse(prefixed);
  } catch {
    throw new AdapterError("INVALID_JSON", "The file is not valid JSON.");
  }
  assertWithinDepth(parsed, MAX_DEPTH);
  return toOrdered(parsed);
}

function printRecord(record: OrderedRecord, indent: string): string {
  if (record.size === 0) {
    return "{}";
  }
  const childIndent = `${indent}  `;
  const lines: string[] = [];
  for (const [key, child] of record) {
    lines.push(`${childIndent}${JSON.stringify(key)}: ${printValue(child, childIndent)}`);
  }
  return `{\n${lines.join(",\n")}\n${indent}}`;
}

function printArray(items: readonly OrderedValue[], indent: string): string {
  if (items.length === 0) {
    return "[]";
  }
  const childIndent = `${indent}  `;
  const lines = items.map((item) => `${childIndent}${printValue(item, childIndent)}`);
  return `[\n${lines.join(",\n")}\n${indent}]`;
}

function printValue(value: OrderedValue, indent: string): string {
  if (value instanceof Map) {
    return printRecord(value, indent);
  }
  if (Array.isArray(value)) {
    return printArray(value, indent);
  }
  return JSON.stringify(value);
}

export function serializeOrderedJson(value: OrderedValue): string {
  return `${printValue(value, "")}\n`;
}
