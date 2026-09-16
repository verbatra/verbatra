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

type Failure =
  | { readonly kind: "not-markup" }
  | { readonly kind: "end-of-file" }
  | { readonly kind: "mismatched-close" }
  | { readonly kind: "stray-close"; readonly name: string };

type ElementOutcome = "closed" | Failure;

const NOT_MARKUP: Failure = { kind: "not-markup" };

const END_OF_FILE: Failure = { kind: "end-of-file" };

const MISMATCHED_CLOSE: Failure = { kind: "mismatched-close" };

const TAG_START = /[A-Za-z_$]/;

const TAG_CHAR = /[A-Za-z0-9_$.:-]/;

const GENERIC_PARAMETER_FOLLOWERS = new Set(["extends", ","]);

const TYPE_ARGUMENTS_LIMIT = 128;

const VALUE_POSITION_LOOKBEHIND = 64;

const VALUE_POSITION = /(?:(?<![\w$])return|=>|&&|\|\||(?<![=!<>])=|[(?:,?])\s*$/;

const TYPE_PARAMETER_LIST = /<[A-Za-z_$][\w$]*(?:\s+[A-Za-z_$][\w$]*)*\s*>\s*\(/y;

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

interface OpenElement {
  readonly name: string;
  readonly start: number;
}

const failedElements = new WeakMap<Cursor, Map<number, Failure>>();

function failureMemo(cursor: Cursor): Map<number, Failure> {
  const known = failedElements.get(cursor);
  if (known !== undefined) {
    return known;
  }
  const created = new Map<number, Failure>();
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
    return readQuotedValue(cursor, out) ? "closed" : END_OF_FILE;
  }
  if (char === "{") {
    return readBracedTokens(cursor, out) ? "closed" : END_OF_FILE;
  }
  return char === "<" ? readElement(cursor, out) : NOT_MARKUP;
}

function readAttribute(cursor: Cursor, out: PositionedToken[]): ElementOutcome {
  const position = positionOf(cursor);
  if (charAt(cursor, 0) === "{") {
    out.push({ kind: "markup-attribute", name: "...", ...position });
    return readBracedTokens(cursor, out) ? "closed" : END_OF_FILE;
  }
  const name = readName(cursor);
  if (name === "") {
    return NOT_MARKUP;
  }
  skipWhitespace(cursor);
  if (charAt(cursor, 0) !== "=") {
    return "closed";
  }
  out.push({ kind: "markup-attribute", name, ...position });
  cursor.index += 1;
  return readAttributeValue(cursor, out);
}

type TagEnd = "open" | "self-closed" | Failure;

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
  return atEnd(cursor) ? END_OF_FILE : undefined;
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
  const limit = cursor.index + TYPE_ARGUMENTS_LIMIT;
  let depth = 0;
  while (!atEnd(cursor) && cursor.index < limit) {
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
    return { name, end: NOT_MARKUP };
  }
  if (name !== "" && charAt(cursor, 0) === "<" && !skipTypeArguments(cursor)) {
    return { name, end: NOT_MARKUP };
  }
  if (name === "" && charAt(cursor, 0) !== ">") {
    return { name, end: NOT_MARKUP };
  }
  out.push({ kind: "markup-open", name, ...position });
  return { name, end: readAttributes(cursor, name, out) };
}

function readCloseTag(cursor: Cursor, opened: string, out: PositionedToken[]): ElementOutcome {
  const position = positionOf(cursor);
  cursor.index += 2;
  skipWhitespace(cursor);
  const name = readName(cursor);
  skipWhitespace(cursor);
  if (charAt(cursor, 0) !== ">") {
    return atEnd(cursor) ? END_OF_FILE : NOT_MARKUP;
  }
  if (name !== opened) {
    return { kind: "stray-close", name };
  }
  cursor.index += 1;
  out.push({ kind: "markup-close", name, ...position });
  return "closed";
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

function openElement(
  cursor: Cursor,
  out: PositionedToken[],
  open: OpenElement[],
  failures: Map<number, Failure>,
): ElementOutcome | undefined {
  const start = cursor.index;
  const known = failures.get(start);
  if (known !== undefined) {
    return known;
  }
  const { name, end } = readOpenTag(cursor, out);
  open.push({ name, start });
  if (end === "open") {
    return undefined;
  }
  if (end !== "self-closed") {
    return end;
  }
  open.pop();
  return open.length === 0 ? "closed" : undefined;
}

function closeElement(
  cursor: Cursor,
  out: PositionedToken[],
  open: OpenElement[],
): ElementOutcome | undefined {
  const outcome = readCloseTag(cursor, open[open.length - 1]?.name ?? "", out);
  if (outcome !== "closed") {
    return outcome;
  }
  open.pop();
  return open.length === 0 ? "closed" : undefined;
}

function readChild(
  cursor: Cursor,
  out: PositionedToken[],
  open: OpenElement[],
  failures: Map<number, Failure>,
): ElementOutcome | undefined {
  const char = charAt(cursor, 0);
  if (char === "<" && charAt(cursor, 1) === "/") {
    return closeElement(cursor, out, open);
  }
  if (char === "<") {
    return openElement(cursor, out, open, failures);
  }
  if (char === "{") {
    return readBracedTokens(cursor, out) ? undefined : END_OF_FILE;
  }
  readText(cursor, out);
  return atEnd(cursor) ? END_OF_FILE : undefined;
}

function recordFailure(
  open: readonly OpenElement[],
  failure: Failure,
  failures: Map<number, Failure>,
): Failure {
  let current = failure;
  for (const element of [...open].reverse()) {
    if (current.kind === "stray-close" && current.name === element.name) {
      current = MISMATCHED_CLOSE;
    }
    failures.set(element.start, current);
  }
  return current;
}

function readElement(cursor: Cursor, out: PositionedToken[]): ElementOutcome {
  const failures = failureMemo(cursor);
  const open: OpenElement[] = [];
  let outcome = openElement(cursor, out, open, failures);
  while (outcome === undefined) {
    outcome = readChild(cursor, out, open, failures);
  }
  return outcome === "closed" ? outcome : recordFailure(open, outcome, failures);
}

function startsElement(cursor: Cursor, previous: PositionedToken | undefined): boolean {
  const next = charAt(cursor, 1);
  return regexCanStart(previous) && (next === ">" || TAG_START.test(next));
}

function makesFileUnreadable(cursor: Cursor, failure: Failure): boolean {
  if (failure.kind !== "end-of-file" && failure.kind !== "mismatched-close") {
    return false;
  }
  const lookbehind = Math.max(0, cursor.index - VALUE_POSITION_LOOKBEHIND);
  TYPE_PARAMETER_LIST.lastIndex = cursor.index;
  return (
    VALUE_POSITION.test(cursor.text.slice(lookbehind, cursor.index)) &&
    !TYPE_PARAMETER_LIST.test(cursor.text)
  );
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
  const outcome = readElement(cursor, out);
  if (outcome === "closed") {
    return out;
  }
  restore(cursor, saved);
  if (makesFileUnreadable(cursor, outcome)) {
    cursor.unreadableMarkup = true;
  }
  return undefined;
}
