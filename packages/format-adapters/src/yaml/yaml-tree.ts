import {
  type Document,
  isMap,
  isPair,
  isScalar,
  isSeq,
  LineCounter,
  type Node,
  type Pair,
  parseDocument,
  type YAMLError,
  type YAMLMap,
} from "yaml";
import { AdapterError, type SyntaxPosition } from "../errors.js";
import { assertJsonRecord, type JsonRecord } from "../json/json-tree.js";
import { MAX_DEPTH } from "../json/limits.js";
import { assertWithinDepth } from "../json/ordered-json.js";
import { describePosition } from "../json/syntax-position.js";

interface DuplicateKey {
  start: number;
  end: number;
}

const FRAME_WIDTH = 80;

function normalizeKey(key: unknown): string {
  if (typeof key === "object" && key !== null) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      "A mapping key is a map or sequence (expected scalar keys).",
    );
  }
  return String(key);
}

function normalizeYamlTree(value: unknown): unknown {
  if (!(value instanceof Map)) {
    return value;
  }
  const out = new Map<string, unknown>();
  for (const [key, child] of value) {
    out.set(normalizeKey(key), normalizeYamlTree(child));
  }
  return out;
}

function skipTrivia(content: string, from: number): number {
  let index = from;
  while (index < content.length) {
    const char = content.charAt(index);
    if (char === "#") {
      const lineEnd = content.indexOf("\n", index);
      index = lineEnd === -1 ? content.length : lineEnd;
    } else if (char === " " || char === "\t" || char === "\n" || char === "\r") {
      index += 1;
    } else {
      break;
    }
  }
  return index;
}

function duplicateAt(content: string, key: Node): DuplicateKey | undefined {
  const range = key.range;
  if (!range) {
    return undefined;
  }
  const start = range[0] === range[1] ? skipTrivia(content, range[0]) : range[0];
  return { start, end: Math.max(start, range[1]) };
}

function comparableKey(pair: Pair): { comparable: boolean; value: unknown } {
  const key = pair.key;
  if (!isScalar(key)) {
    return { comparable: false, value: undefined };
  }
  const value = key.value;
  return { comparable: !(typeof value === "number" && Number.isNaN(value)), value };
}

function firstDuplicateInMap(content: string, map: YAMLMap): DuplicateKey | undefined {
  const seen = new Set<unknown>();
  for (const pair of map.items) {
    const { comparable, value } = comparableKey(pair);
    if (!comparable) {
      continue;
    }
    if (seen.has(value)) {
      return duplicateAt(content, pair.key as Node);
    }
    seen.add(value);
  }
  return undefined;
}

function pushChildren(stack: unknown[], node: unknown): void {
  if (isMap(node) || isSeq(node)) {
    for (const item of node.items) {
      stack.push(item);
    }
  } else if (isPair(node)) {
    stack.push(node.key, node.value);
  }
}

function earliestDuplicateKey(content: string, root: unknown): DuplicateKey | undefined {
  let earliest: DuplicateKey | undefined;
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (isMap(node)) {
      const found = firstDuplicateInMap(content, node);
      if (found !== undefined && (earliest === undefined || found.start < earliest.start)) {
        earliest = found;
      }
    }
    pushChildren(stack, node);
  }
  return earliest;
}

function failInvalidYaml(offset: number | undefined, lineCounter: LineCounter): never {
  const located = offset === undefined ? undefined : lineCounter.linePos(offset);
  const position: SyntaxPosition | undefined =
    located === undefined ? undefined : { line: located.line, column: located.col };
  throw new AdapterError(
    "INVALID_YAML",
    describePosition("The file is not valid YAML.", position),
    position === undefined ? undefined : { position },
  );
}

function failFirstProblem(
  errors: readonly YAMLError[],
  duplicate: DuplicateKey | undefined,
  lineCounter: LineCounter,
): void {
  const first = errors[0];
  if (duplicate !== undefined && (first === undefined || first.pos[0] > duplicate.end)) {
    failInvalidYaml(duplicate.start, lineCounter);
  }
  if (first !== undefined) {
    failInvalidYaml(first.pos[0], lineCounter);
  }
}

function lineText(source: string, lineCounter: LineCounter, line: number): string {
  return source.substring(lineCounter.lineStarts[line - 1] ?? 0, lineCounter.lineStarts[line]);
}

function trimmedLine(source: string, lineCounter: LineCounter, line: number, column: number) {
  let index = column - 1;
  let text = lineText(source, lineCounter, line).replace(/[\n\r]+$/, "");
  if (index >= 60 && text.length > FRAME_WIDTH) {
    const trimStart = Math.min(index - 39, text.length - 79);
    text = `…${text.substring(trimStart)}`;
    index -= trimStart - 1;
  }
  if (text.length > FRAME_WIDTH) {
    text = `${text.substring(0, 79)}…`;
  }
  return { text, index };
}

function describeWarning(
  source: string,
  lineCounter: LineCounter,
  warning: { message: string; pos: [number, number] },
): string {
  if (warning.pos[0] === -1) {
    return warning.message;
  }
  const [start, end] = warning.pos.map((offset) => lineCounter.linePos(offset)) as [
    { line: number; col: number },
    { line: number; col: number },
  ];
  const { line, col } = start;
  let message = `${warning.message} at line ${line}, column ${col}`;
  const frame = trimmedLine(source, lineCounter, line, col);
  let text = frame.text;
  if (line > 1 && /^ *$/.test(text.substring(0, frame.index))) {
    let previous = lineText(source, lineCounter, line - 1);
    if (previous.length > FRAME_WIDTH) {
      previous = `${previous.substring(0, 79)}…\n`;
    }
    text = previous + text;
  }
  if (/[^ ]/.test(text)) {
    const count =
      end.line === line && end.col > col
        ? Math.max(1, Math.min(end.col - col, FRAME_WIDTH - frame.index))
        : 1;
    message += `:\n\n${text}\n${" ".repeat(frame.index)}${"^".repeat(count)}\n`;
  }
  return message;
}

function emitWarnings(doc: Document.Parsed, source: string, lineCounter: LineCounter): void {
  for (const warning of doc.warnings) {
    warning.message = describeWarning(source, lineCounter, warning);
    process.emitWarning(warning);
  }
}

export function parseYamlObject(content: string): JsonRecord {
  const lineCounter = new LineCounter();
  let doc: Document.Parsed;
  try {
    doc = parseDocument(content, { uniqueKeys: false, prettyErrors: false, lineCounter });
  } catch {
    return failInvalidYaml(undefined, lineCounter);
  }
  emitWarnings(doc, content, lineCounter);
  failFirstProblem(doc.errors, earliestDuplicateKey(content, doc.contents), lineCounter);
  let parsed: unknown;
  try {
    parsed = doc.toJS({ mapAsMap: true, maxAliasCount: 100 });
  } catch {
    return failInvalidYaml(undefined, lineCounter);
  }
  assertWithinDepth(parsed, MAX_DEPTH);
  return assertJsonRecord(normalizeYamlTree(parsed));
}
