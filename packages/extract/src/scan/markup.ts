import {
  advance,
  atEnd,
  type Cursor,
  charAt,
  columnOf,
  isWhitespace,
  nextTokens,
  type PositionedToken,
  regexCanStart,
  skipTrivia,
} from "./tokenize.js";

type ElementOutcome = "closed" | "not-markup" | "unclosed";

const TAG_START = /[A-Za-z_$]/;

const TAG_CHAR = /[A-Za-z0-9_$.:-]/;

const GENERIC_PARAMETER_FOLLOWERS = new Set(["extends", ","]);

interface Position {
  readonly line: number;
  readonly column: number;
}

interface Snapshot {
  readonly index: number;
  readonly line: number;
  readonly lineStart: number;
  readonly comments: number;
  readonly truncated: boolean;
}

const failedElements = new WeakMap<Cursor, Set<number>>();

function failedStarts(cursor: Cursor): Set<number> {
  const known = failedElements.get(cursor);
  if (known !== undefined) {
    return known;
  }
  const created = new Set<number>();
  failedElements.set(cursor, created);
  return created;
}

function positionOf(cursor: Cursor): Position {
  return { line: cursor.line, column: columnOf(cursor) };
}

function snapshot(cursor: Cursor): Snapshot {
  return {
    index: cursor.index,
    line: cursor.line,
    lineStart: cursor.lineStart,
    comments: cursor.comments.length,
    truncated: cursor.truncated,
  };
}

function restore(cursor: Cursor, saved: Snapshot): void {
  cursor.index = saved.index;
  cursor.line = saved.line;
  cursor.lineStart = saved.lineStart;
  cursor.comments.length = saved.comments;
  cursor.truncated = saved.truncated;
}

function skipWhitespace(cursor: Cursor): void {
  while (!atEnd(cursor) && isWhitespace(charAt(cursor, 0))) {
    advance(cursor);
  }
}

function readName(cursor: Cursor): string {
  const start = cursor.index;
  if (!TAG_START.test(charAt(cursor, 0))) {
    return "";
  }
  while (!atEnd(cursor) && TAG_CHAR.test(charAt(cursor, 0))) {
    cursor.index += 1;
  }
  return cursor.text.slice(start, cursor.index);
}

function readBracedTokens(cursor: Cursor, out: PositionedToken[]): boolean {
  let depth = 0;
  while (true) {
    skipTrivia(cursor);
    if (atEnd(cursor)) {
      return false;
    }
    const produced = nextTokens(cursor, out[out.length - 1]);
    for (const token of produced) {
      out.push(token);
      if (token.kind === "punct" && token.value === "{") {
        depth += 1;
      } else if (token.kind === "punct" && token.value === "}") {
        depth -= 1;
      }
    }
    if (depth === 0) {
      return true;
    }
  }
}

function readQuotedValue(cursor: Cursor, out: PositionedToken[]): boolean {
  const position = positionOf(cursor);
  const quote = advance(cursor);
  const start = cursor.index;
  while (!atEnd(cursor)) {
    if (charAt(cursor, 0) === quote) {
      out.push({ kind: "string", value: cursor.text.slice(start, cursor.index), ...position });
      cursor.index += 1;
      return true;
    }
    advance(cursor);
  }
  return false;
}

function readAttributeValue(cursor: Cursor, out: PositionedToken[]): ElementOutcome {
  skipWhitespace(cursor);
  const char = charAt(cursor, 0);
  if (char === '"' || char === "'") {
    return readQuotedValue(cursor, out) ? "closed" : "unclosed";
  }
  if (char === "{") {
    return readBracedTokens(cursor, out) ? "closed" : "unclosed";
  }
  return "not-markup";
}

function readAttribute(cursor: Cursor, out: PositionedToken[]): ElementOutcome {
  const position = positionOf(cursor);
  if (charAt(cursor, 0) === "{") {
    out.push({ kind: "markup-attribute", name: "...", ...position });
    return readBracedTokens(cursor, out) ? "closed" : "unclosed";
  }
  const name = readName(cursor);
  if (name === "") {
    return "not-markup";
  }
  skipWhitespace(cursor);
  if (charAt(cursor, 0) !== "=") {
    return "closed";
  }
  out.push({ kind: "markup-attribute", name, ...position });
  cursor.index += 1;
  return readAttributeValue(cursor, out);
}

type TagEnd = "open" | "self-closed" | "not-markup" | "unclosed";

function readTagEnd(cursor: Cursor, name: string, out: PositionedToken[]): TagEnd | undefined {
  const position = positionOf(cursor);
  if (charAt(cursor, 0) === ">") {
    cursor.index += 1;
    return "open";
  }
  if (charAt(cursor, 0) === "/" && charAt(cursor, 1) === ">") {
    cursor.index += 2;
    out.push({ kind: "markup-close", name, ...position });
    return "self-closed";
  }
  return atEnd(cursor) ? "unclosed" : undefined;
}

function readAttributes(cursor: Cursor, name: string, out: PositionedToken[]): TagEnd {
  while (true) {
    skipWhitespace(cursor);
    const end = readTagEnd(cursor, name, out);
    if (end !== undefined) {
      return end;
    }
    const outcome = readAttribute(cursor, out);
    if (outcome !== "closed") {
      return outcome;
    }
  }
}

function startsGenericParameters(cursor: Cursor): boolean {
  const saved = snapshot(cursor);
  skipWhitespace(cursor);
  const follower = charAt(cursor, 0) === "," ? "," : readName(cursor);
  restore(cursor, saved);
  return GENERIC_PARAMETER_FOLLOWERS.has(follower);
}

function skipTypeArguments(cursor: Cursor): boolean {
  let depth = 0;
  while (!atEnd(cursor)) {
    const char = advance(cursor);
    if (char === "<") {
      depth += 1;
    } else if (char === ">" && cursor.text[cursor.index - 2] !== "=") {
      depth -= 1;
    }
    if (depth === 0) {
      return true;
    }
  }
  return false;
}

function readOpenTag(cursor: Cursor, out: PositionedToken[]): { name: string; end: TagEnd } {
  const position = positionOf(cursor);
  cursor.index += 1;
  const name = readName(cursor);
  if (name !== "" && startsGenericParameters(cursor)) {
    return { name, end: "not-markup" };
  }
  if (name !== "" && charAt(cursor, 0) === "<" && !skipTypeArguments(cursor)) {
    return { name, end: "not-markup" };
  }
  if (name === "" && charAt(cursor, 0) !== ">") {
    return { name, end: "not-markup" };
  }
  out.push({ kind: "markup-open", name, ...position });
  return { name, end: readAttributes(cursor, name, out) };
}

function readCloseTag(cursor: Cursor, opened: string, out: PositionedToken[]): boolean {
  const position = positionOf(cursor);
  cursor.index += 2;
  skipWhitespace(cursor);
  const name = readName(cursor);
  skipWhitespace(cursor);
  if (name !== opened || charAt(cursor, 0) !== ">") {
    return false;
  }
  cursor.index += 1;
  out.push({ kind: "markup-close", name, ...position });
  return true;
}

function readText(cursor: Cursor, out: PositionedToken[]): void {
  skipWhitespace(cursor);
  const position = positionOf(cursor);
  const start = cursor.index;
  while (!atEnd(cursor) && charAt(cursor, 0) !== "<" && charAt(cursor, 0) !== "{") {
    advance(cursor);
  }
  if (cursor.index > start) {
    out.push({ kind: "markup-text", value: cursor.text.slice(start, cursor.index), ...position });
  }
}

function readChild(
  cursor: Cursor,
  opened: string,
  out: PositionedToken[],
): ElementOutcome | undefined {
  const char = charAt(cursor, 0);
  if (char === "<" && charAt(cursor, 1) === "/") {
    return readCloseTag(cursor, opened, out) ? "closed" : "unclosed";
  }
  if (char === "<") {
    return readElement(cursor, out) === "closed" ? undefined : "unclosed";
  }
  if (char === "{") {
    return readBracedTokens(cursor, out) ? undefined : "unclosed";
  }
  readText(cursor, out);
  return atEnd(cursor) ? "unclosed" : undefined;
}

function readChildren(cursor: Cursor, opened: string, out: PositionedToken[]): ElementOutcome {
  while (true) {
    const outcome = readChild(cursor, opened, out);
    if (outcome !== undefined) {
      return outcome;
    }
  }
}

function readElementOnce(cursor: Cursor, out: PositionedToken[]): ElementOutcome {
  const { name, end } = readOpenTag(cursor, out);
  if (end === "open") {
    return readChildren(cursor, name, out);
  }
  return end === "self-closed" ? "closed" : end;
}

function readElement(cursor: Cursor, out: PositionedToken[]): ElementOutcome {
  const failed = failedStarts(cursor);
  const start = cursor.index;
  if (failed.has(start)) {
    return "unclosed";
  }
  const outcome = readElementOnce(cursor, out);
  if (outcome !== "closed") {
    failed.add(start);
  }
  return outcome;
}

function startsElement(cursor: Cursor, previous: PositionedToken | undefined): boolean {
  const next = charAt(cursor, 1);
  return regexCanStart(previous) && (next === ">" || TAG_START.test(next));
}

export function readMarkup(
  cursor: Cursor,
  previous: PositionedToken | undefined,
): readonly PositionedToken[] | undefined {
  if (!startsElement(cursor, previous)) {
    return undefined;
  }
  const saved = snapshot(cursor);
  const out: PositionedToken[] = [];
  if (readElement(cursor, out) !== "closed") {
    restore(cursor, saved);
    return undefined;
  }
  return out;
}
