export type SourceToken =
  | { readonly kind: "ident"; readonly value: string; readonly line: number }
  | { readonly kind: "string"; readonly value: string; readonly line: number }
  | { readonly kind: "dynamic"; readonly line: number }
  | { readonly kind: "punct"; readonly value: string; readonly line: number };

export type MarkupToken =
  | { readonly kind: "markup-open"; readonly name: string; readonly line: number }
  | { readonly kind: "markup-close"; readonly name: string; readonly line: number }
  | { readonly kind: "markup-attribute"; readonly name: string; readonly line: number }
  | { readonly kind: "markup-text"; readonly value: string; readonly line: number };

export type PositionedToken = (SourceToken | MarkupToken) & { readonly column: number };

export interface SourceComment {
  readonly text: string;
  readonly line: number;
  readonly endLine: number;
}

export type MarkupReader = (
  cursor: Cursor,
  previous: PositionedToken | undefined,
) => readonly PositionedToken[] | undefined;

export interface ScanOptions {
  readonly markup?: MarkupReader;
}

export interface Cursor {
  readonly text: string;
  readonly options: ScanOptions;
  readonly comments: SourceComment[];
  index: number;
  line: number;
  lineStart: number;
  truncated: boolean;
}

export interface SourceScan {
  readonly tokens: readonly SourceToken[];
  readonly truncated: boolean;
}

export interface PositionedScan {
  readonly tokens: readonly PositionedToken[];
  readonly comments: readonly SourceComment[];
  readonly truncated: boolean;
}

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  n: "\n",
  t: "\t",
  r: "\r",
  b: "\b",
  f: "\f",
  v: "\v",
  "0": "\0",
};

const REGEX_FOLLOWING_KEYWORDS = new Set([
  "return",
  "typeof",
  "instanceof",
  "in",
  "of",
  "new",
  "delete",
  "void",
  "throw",
  "do",
  "else",
  "yield",
  "await",
  "case",
]);

const VALUE_CLOSING_PUNCT = new Set([")", "]", "}"]);

export function charAt(cursor: Cursor, offset: number): string {
  return cursor.text[cursor.index + offset] ?? "";
}

export function atEnd(cursor: Cursor): boolean {
  return cursor.index >= cursor.text.length;
}

export function advance(cursor: Cursor): string {
  const char = charAt(cursor, 0);
  if (char === "\n") {
    cursor.line += 1;
    cursor.lineStart = cursor.index + 1;
  }
  cursor.index += 1;
  return char;
}

export function columnOf(cursor: Cursor): number {
  return cursor.index - cursor.lineStart + 1;
}

export function isAtomChar(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char);
}

export function isWhitespace(char: string): boolean {
  return /\s/.test(char);
}

function skipLineComment(cursor: Cursor): void {
  while (!atEnd(cursor) && charAt(cursor, 0) !== "\n") {
    cursor.index += 1;
  }
}

function skipBlockComment(cursor: Cursor): void {
  cursor.index += 2;
  while (!atEnd(cursor)) {
    if (charAt(cursor, 0) === "*" && charAt(cursor, 1) === "/") {
      cursor.index += 2;
      return;
    }
    advance(cursor);
  }
  cursor.truncated = true;
}

function skipRecordedComment(cursor: Cursor, skip: (cursor: Cursor) => void): void {
  const start = cursor.index;
  const line = cursor.line;
  skip(cursor);
  cursor.comments.push({
    text: cursor.text.slice(start, cursor.index),
    line,
    endLine: cursor.line,
  });
}

export function skipTrivia(cursor: Cursor): void {
  while (!atEnd(cursor)) {
    const char = charAt(cursor, 0);
    if (isWhitespace(char)) {
      advance(cursor);
    } else if (char === "/" && charAt(cursor, 1) === "/") {
      skipRecordedComment(cursor, skipLineComment);
    } else if (char === "/" && charAt(cursor, 1) === "*") {
      skipRecordedComment(cursor, skipBlockComment);
    } else {
      return;
    }
  }
}

const BRACED_CODE_POINT = /^\{([0-9A-Fa-f]{1,6})\}/;

const FOUR_HEX_DIGITS = /^[0-9A-Fa-f]{4}$/;

const MAX_CODE_POINT = 0x10_ff_ff;

function readBracedCodePoint(cursor: Cursor): string {
  const match = BRACED_CODE_POINT.exec(cursor.text.slice(cursor.index, cursor.index + 9));
  if (match?.[1] === undefined) {
    return "";
  }
  cursor.index += match[0].length;
  const value = Number.parseInt(match[1], 16);
  return value > MAX_CODE_POINT ? "" : String.fromCodePoint(value);
}

function readUnicodeEscape(cursor: Cursor): string {
  if (charAt(cursor, 0) === "{") {
    return readBracedCodePoint(cursor);
  }
  const code = cursor.text.slice(cursor.index, cursor.index + 4);
  if (!FOUR_HEX_DIGITS.test(code)) {
    return "";
  }
  cursor.index += 4;
  return String.fromCharCode(Number.parseInt(code, 16));
}

const TWO_HEX_DIGITS = /^[0-9A-Fa-f]{2}$/;

function readHexEscape(cursor: Cursor): string {
  const code = cursor.text.slice(cursor.index, cursor.index + 2);
  if (!TWO_HEX_DIGITS.test(code)) {
    return "";
  }
  cursor.index += 2;
  return String.fromCharCode(Number.parseInt(code, 16));
}

function readEscape(cursor: Cursor): string {
  cursor.index += 1;
  const marker = advance(cursor);
  if (marker === "u") {
    return readUnicodeEscape(cursor);
  }
  if (marker === "x") {
    return readHexEscape(cursor);
  }
  if (marker === "\n") {
    return "";
  }
  return SIMPLE_ESCAPES[marker] ?? marker;
}

function readStringToken(cursor: Cursor, quote: string): PositionedToken {
  const line = cursor.line;
  const lineStart = cursor.lineStart;
  const column = columnOf(cursor);
  const start = cursor.index;
  cursor.index += 1;
  let value = "";
  while (!atEnd(cursor)) {
    const char = charAt(cursor, 0);
    if (char === "\\") {
      value += readEscape(cursor);
    } else if (char === quote) {
      cursor.index += 1;
      return { kind: "string", value, line, column };
    } else if (char === "\n") {
      break;
    } else {
      value += advance(cursor);
    }
  }
  cursor.index = start + 1;
  cursor.line = line;
  cursor.lineStart = lineStart;
  return { kind: "punct", value: quote, line, column };
}

function skipStringRaw(cursor: Cursor, quote: string): void {
  cursor.index += 1;
  while (!atEnd(cursor)) {
    const char = advance(cursor);
    if (char === "\\") {
      advance(cursor);
    } else if (char === quote || char === "\n") {
      return;
    }
  }
}

function skipTemplateRaw(cursor: Cursor): void {
  cursor.index += 1;
  while (!atEnd(cursor)) {
    const char = charAt(cursor, 0);
    if (char === "\\") {
      cursor.index += 2;
    } else if (char === "`") {
      cursor.index += 1;
      return;
    } else if (char === "$" && charAt(cursor, 1) === "{") {
      cursor.index += 2;
      skipBalancedExpression(cursor);
    } else {
      advance(cursor);
    }
  }
}

function skipExpressionChar(cursor: Cursor, depth: number): number {
  const char = charAt(cursor, 0);
  if (char === '"' || char === "'") {
    skipStringRaw(cursor, char);
    return depth;
  }
  if (char === "`") {
    skipTemplateRaw(cursor);
    return depth;
  }
  if (char === "/" && charAt(cursor, 1) === "/") {
    skipLineComment(cursor);
    return depth;
  }
  if (char === "/" && charAt(cursor, 1) === "*") {
    skipBlockComment(cursor);
    return depth;
  }
  advance(cursor);
  if (char === "{") {
    return depth + 1;
  }
  return char === "}" ? depth - 1 : depth;
}

function skipBalancedExpression(cursor: Cursor): void {
  let depth = 1;
  while (!atEnd(cursor) && depth > 0) {
    depth = skipExpressionChar(cursor, depth);
  }
}

interface TemplateExpression {
  readonly text: string;
  readonly line: number;
  readonly column: number;
}

interface TemplateParts {
  readonly line: number;
  readonly column: number;
  readonly staticValue: string;
  readonly expressions: readonly TemplateExpression[];
  readonly dynamic: boolean;
}

function readTemplateParts(cursor: Cursor): TemplateParts {
  const line = cursor.line;
  const column = columnOf(cursor);
  cursor.index += 1;
  let staticValue = "";
  let dynamic = false;
  const expressions: TemplateExpression[] = [];
  while (!atEnd(cursor)) {
    const char = charAt(cursor, 0);
    if (char === "\\") {
      staticValue += readEscape(cursor);
    } else if (char === "`") {
      cursor.index += 1;
      return { line, column, staticValue, expressions, dynamic };
    } else if (char === "$" && charAt(cursor, 1) === "{") {
      dynamic = true;
      cursor.index += 2;
      const start = cursor.index;
      const startLine = cursor.line;
      const startColumn = columnOf(cursor);
      skipBalancedExpression(cursor);
      expressions.push({
        text: cursor.text.slice(start, cursor.index - 1),
        line: startLine,
        column: startColumn,
      });
    } else {
      staticValue += advance(cursor);
    }
  }
  cursor.truncated = true;
  return { line, column, staticValue, expressions, dynamic: true };
}

function shiftPosition(token: PositionedToken, expression: TemplateExpression): PositionedToken {
  const column = token.line === 1 ? token.column + expression.column - 1 : token.column;
  return { ...token, line: token.line + expression.line - 1, column };
}

function readExpressionTokens(
  cursor: Cursor,
  expression: TemplateExpression,
): readonly PositionedToken[] {
  const scan = scanSource(expression.text, cursor.options);
  if (scan.truncated) {
    cursor.truncated = true;
  }
  for (const comment of scan.comments) {
    cursor.comments.push({
      text: comment.text,
      line: comment.line + expression.line - 1,
      endLine: comment.endLine + expression.line - 1,
    });
  }
  return scan.tokens.map((token) => shiftPosition(token, expression));
}

function readTemplateTokens(cursor: Cursor): readonly PositionedToken[] {
  const parts = readTemplateParts(cursor);
  const position = { line: parts.line, column: parts.column };
  if (!parts.dynamic) {
    return [{ kind: "string", value: parts.staticValue, ...position }];
  }
  const inner = parts.expressions.flatMap((expression) => readExpressionTokens(cursor, expression));
  return [{ kind: "dynamic", ...position }, ...inner];
}

function readAtomToken(cursor: Cursor): PositionedToken {
  const line = cursor.line;
  const column = columnOf(cursor);
  const start = cursor.index;
  while (!atEnd(cursor) && isAtomChar(charAt(cursor, 0))) {
    cursor.index += 1;
  }
  return { kind: "ident", value: cursor.text.slice(start, cursor.index), line, column };
}

export function regexCanStart(previous: PositionedToken | undefined): boolean {
  if (previous === undefined) {
    return true;
  }
  if (previous.kind === "punct") {
    return !VALUE_CLOSING_PUNCT.has(previous.value);
  }
  return previous.kind === "ident" && REGEX_FOLLOWING_KEYWORDS.has(previous.value);
}

function trySkipRegex(cursor: Cursor): boolean {
  const start = cursor.index;
  cursor.index += 1;
  let inClass = false;
  while (!atEnd(cursor)) {
    const char = charAt(cursor, 0);
    if (char === "\\") {
      cursor.index += 2;
      continue;
    }
    if (char === "\n") {
      break;
    }
    cursor.index += 1;
    if (char === "[") {
      inClass = true;
    } else if (char === "]") {
      inClass = false;
    } else if (char === "/" && !inClass) {
      return true;
    }
  }
  cursor.index = start;
  return false;
}

function readMarkupTokens(
  cursor: Cursor,
  previous: PositionedToken | undefined,
): readonly PositionedToken[] | undefined {
  const reader = cursor.options.markup;
  return reader === undefined ? undefined : reader(cursor, previous);
}

export function nextTokens(
  cursor: Cursor,
  previous: PositionedToken | undefined,
): readonly PositionedToken[] {
  const char = charAt(cursor, 0);
  if (char === '"' || char === "'") {
    return [readStringToken(cursor, char)];
  }
  if (char === "`") {
    return readTemplateTokens(cursor);
  }
  if (isAtomChar(char)) {
    return [readAtomToken(cursor)];
  }
  if (char === "/" && regexCanStart(previous) && trySkipRegex(cursor)) {
    return [];
  }
  const markup = char === "<" ? readMarkupTokens(cursor, previous) : undefined;
  if (markup !== undefined) {
    return markup;
  }
  const line = cursor.line;
  const column = columnOf(cursor);
  advance(cursor);
  return [{ kind: "punct", value: char, line, column }];
}

export function scanSource(text: string, options: ScanOptions = {}): PositionedScan {
  const cursor: Cursor = {
    text,
    options,
    comments: [],
    index: 0,
    line: 1,
    lineStart: 0,
    truncated: false,
  };
  const tokens: PositionedToken[] = [];
  while (true) {
    skipTrivia(cursor);
    if (atEnd(cursor)) {
      return { tokens, comments: cursor.comments, truncated: cursor.truncated };
    }
    const produced = nextTokens(cursor, tokens[tokens.length - 1]);
    tokens.push(...produced);
  }
}

function toSourceToken(token: PositionedToken): readonly SourceToken[] {
  switch (token.kind) {
    case "ident":
      return [{ kind: "ident", value: token.value, line: token.line }];
    case "string":
      return [{ kind: "string", value: token.value, line: token.line }];
    case "punct":
      return [{ kind: "punct", value: token.value, line: token.line }];
    case "dynamic":
      return [{ kind: "dynamic", line: token.line }];
    default:
      return [];
  }
}

export function tokenizeSource(text: string): SourceScan {
  const scan = scanSource(text);
  return { tokens: scan.tokens.flatMap(toSourceToken), truncated: scan.truncated };
}
