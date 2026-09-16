import { type Cursor, charAt, isWhitespace } from "./tokenize.js";

export type TypeParameterShape = "plain" | "marked";

const GROUP_CLOSERS: ReadonlyMap<string, string> = new Map([
  ["(", ")"],
  ["[", "]"],
  ["{", "}"],
  ["<", ">"],
]);

const CLOSERS = new Set([")", "]", "}", ">"]);

const QUOTES = new Set(['"', "'", "`"]);

const TYPE_PARAMETER =
  /^(?:const\s+)?[A-Za-z_$][\w$]*(?:\s+extends\s+[\s\S]+?)?(?:\s*=\s*[\s\S]+)?$/;

const MARKED_TYPE_PARAMETER = /^const\s|\sextends\s|=/;

const knownGroupEnds = new WeakMap<Cursor, Map<number, number>>();

function groupEndsOf(cursor: Cursor): Map<number, number> {
  const known = knownGroupEnds.get(cursor);
  if (known !== undefined) {
    return known;
  }
  const created = new Map<number, number>();
  knownGroupEnds.set(cursor, created);
  return created;
}

function readAt(cursor: Cursor, index: number): string {
  return charAt(cursor, index - cursor.index);
}

function quoteEnd(cursor: Cursor, start: number): number {
  const quote = readAt(cursor, start);
  for (let index = start + 1; index < cursor.text.length; index += 1) {
    const char = readAt(cursor, index);
    if (char === "\\") {
      index += 1;
    } else if (char === quote) {
      return index;
    } else if (char === "\n" && quote !== "`") {
      return -1;
    }
  }
  return -1;
}

function isCloser(cursor: Cursor, index: number, char: string): boolean {
  return CLOSERS.has(char) && !(char === ">" && readAt(cursor, index - 1) === "=");
}

function failGroups(open: readonly number[], ends: Map<number, number>): number {
  for (const start of open) {
    ends.set(start, -1);
  }
  return -1;
}

interface GroupScan {
  readonly cursor: Cursor;
  readonly ends: Map<number, number>;
  readonly open: number[];
}

function closeGroup(scan: GroupScan, index: number, char: string): number | undefined {
  const start = scan.open.pop() ?? -1;
  if (GROUP_CLOSERS.get(readAt(scan.cursor, start)) !== char) {
    scan.ends.set(start, -1);
    return failGroups(scan.open, scan.ends);
  }
  scan.ends.set(start, index);
  return scan.open.length === 0 ? index : undefined;
}

function skipKnownGroup(scan: GroupScan, known: number): number | undefined {
  if (known < 0) {
    return failGroups(scan.open, scan.ends);
  }
  return scan.open.length === 0 ? known : undefined;
}

interface GroupStep {
  readonly index: number;
  readonly result?: number;
}

function stepGroup(scan: GroupScan, index: number): GroupStep {
  const char = readAt(scan.cursor, index);
  const known = GROUP_CLOSERS.has(char) ? scan.ends.get(index) : undefined;
  if (known !== undefined) {
    const result = skipKnownGroup(scan, known);
    return result === undefined ? { index: Math.max(index, known) } : { index, result };
  }
  if (GROUP_CLOSERS.has(char)) {
    scan.open.push(index);
    return { index };
  }
  if (QUOTES.has(char)) {
    const end = quoteEnd(scan.cursor, index);
    return end < 0 ? { index, result: failGroups(scan.open, scan.ends) } : { index: end };
  }
  const result = isCloser(scan.cursor, index, char) ? closeGroup(scan, index, char) : undefined;
  return result === undefined ? { index } : { index, result };
}

export function groupEnd(cursor: Cursor, start: number): number {
  const scan: GroupScan = { cursor, ends: groupEndsOf(cursor), open: [] };
  for (let index = start; index < cursor.text.length; index += 1) {
    const step = stepGroup(scan, index);
    if (step.result !== undefined) {
      return step.result;
    }
    index = step.index;
  }
  return failGroups(scan.open, scan.ends);
}

function flattenGroups(cursor: Cursor, start: number, end: number): string {
  const parts: string[] = [];
  for (let index = start; index < end; index += 1) {
    const char = readAt(cursor, index);
    if (GROUP_CLOSERS.has(char)) {
      parts.push("0");
      index = groupEnd(cursor, index);
    } else if (QUOTES.has(char)) {
      parts.push("0");
      index = quoteEnd(cursor, index);
    } else {
      parts.push(char);
    }
  }
  return parts.join("");
}

function opensParameters(cursor: Cursor, index: number): boolean {
  let cursorIndex = index;
  while (isWhitespace(readAt(cursor, cursorIndex))) {
    cursorIndex += 1;
  }
  return readAt(cursor, cursorIndex) === "(";
}

function shapeOf(list: string): TypeParameterShape | undefined {
  const parameters = list.split(",").map((parameter) => parameter.trim());
  const trailing = parameters.length > 1 && parameters[parameters.length - 1] === "";
  const named = trailing ? parameters.slice(0, -1) : parameters;
  if (!named.every((parameter) => TYPE_PARAMETER.test(parameter))) {
    return undefined;
  }
  const marked =
    trailing ||
    named.length > 1 ||
    named.some((parameter) => MARKED_TYPE_PARAMETER.test(parameter));
  return marked ? "marked" : "plain";
}

export function typeParameterListAt(cursor: Cursor, start: number): TypeParameterShape | undefined {
  const end = groupEnd(cursor, start);
  if (end < 0 || !opensParameters(cursor, end + 1)) {
    return undefined;
  }
  return shapeOf(flattenGroups(cursor, start + 1, end));
}
