export type SourceToken =
  | { readonly kind: "ident"; readonly value: string; readonly line: number }
  | { readonly kind: "string"; readonly value: string; readonly line: number }
  | {
      readonly kind: "dynamic";
      readonly line: number;
      readonly head?: string;
      readonly span?: number;
    }
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
  unreadableMarkup: boolean;
}

export interface SourceScan {
  readonly tokens: readonly SourceToken[];
  readonly truncated: boolean;
}

export interface PositionedScan {
  readonly tokens: readonly PositionedToken[];
  readonly comments: readonly SourceComment[];
  readonly truncated: boolean;
  readonly unreadableMarkup: boolean;
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

const CLOSING_TAG = /^\/[A-Za-z0-9\-.:]*\s*>/;

const CLOSING_TAG_LOOKAHEAD = 256;

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

interface Substitution {
  readonly floor: number;
  depth: number;
}

interface OpenTemplate {
  readonly at: number;
  readonly line: number;
  readonly column: number;
  staticValue: string;
  head: string | undefined;
  dynamic: boolean;
  substitution: Substitution | undefined;
}

type TemplateStep = "closed" | "substitution" | "end" | "nested" | "resumed" | "token";

function openTemplate(cursor: Cursor, out: PositionedToken[]): OpenTemplate {
  const line = cursor.line;
  const column = columnOf(cursor);
  const template: OpenTemplate = {
    at: out.length,
    line,
    column,
    staticValue: "",
    head: undefined,
    dynamic: false,
    substitution: undefined,
  };
  out.push({ kind: "string", value: "", line, column });
  cursor.index += 1;
  return template;
}

function closeTemplate(out: PositionedToken[], template: OpenTemplate): void {
  const position = { line: template.line, column: template.column };
  out[template.at] = template.dynamic
    ? {
        kind: "dynamic",
        ...position,
        head: template.head ?? template.staticValue,
        span: out.length - template.at - 1,
      }
    : { kind: "string", value: template.staticValue, ...position };
}

function readTemplateText(cursor: Cursor, template: OpenTemplate): TemplateStep {
  while (!atEnd(cursor)) {
    const char = charAt(cursor, 0);
    if (char === "\\") {
      template.staticValue += readEscape(cursor);
    } else if (char === "`") {
      cursor.index += 1;
      return "closed";
    } else if (char === "$" && charAt(cursor, 1) === "{") {
      template.head ??= template.staticValue;
      template.dynamic = true;
      cursor.index += 2;
      return "substitution";
    } else {
      template.staticValue += advance(cursor);
    }
  }
  return "end";
}

function braceDelta(char: string): number {
  if (char === "{") {
    return 1;
  }
  return char === "}" ? -1 : 0;
}

function readSubstitution(
  cursor: Cursor,
  out: PositionedToken[],
  substitution: Substitution,
): TemplateStep {
  skipTrivia(cursor);
  if (atEnd(cursor)) {
    return "end";
  }
  const char = charAt(cursor, 0);
  if (char === "`") {
    return "nested";
  }
  if (char === "}" && substitution.depth === 0) {
    cursor.index += 1;
    return "resumed";
  }
  substitution.depth += braceDelta(char);
  const previous = out.length > substitution.floor ? out[out.length - 1] : undefined;
  emitTokens(cursor, previous, out);
  return "token";
}

function abandonTemplates(cursor: Cursor, out: PositionedToken[], open: OpenTemplate[]): void {
  cursor.truncated = true;
  for (const template of open) {
    template.dynamic = true;
    closeTemplate(out, template);
  }
  open.length = 0;
}

function applyTemplateStep(
  cursor: Cursor,
  out: PositionedToken[],
  open: OpenTemplate[],
  current: OpenTemplate,
  step: TemplateStep,
): void {
  switch (step) {
    case "closed":
      closeTemplate(out, current);
      open.pop();
      return;
    case "substitution":
      current.substitution = { floor: out.length, depth: 0 };
      return;
    case "resumed":
      current.substitution = undefined;
      return;
    case "nested":
      open.push(openTemplate(cursor, out));
      return;
    case "end":
      abandonTemplates(cursor, out, open);
      return;
    default:
      return;
  }
}

function emitTemplate(cursor: Cursor, out: PositionedToken[]): void {
  const open = [openTemplate(cursor, out)];
  for (let current = open[0]; current !== undefined; current = open[open.length - 1]) {
    const step =
      current.substitution === undefined
        ? readTemplateText(cursor, current)
        : readSubstitution(cursor, out, current.substitution);
    applyTemplateStep(cursor, out, open, current, step);
  }
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

function isClosingTag(cursor: Cursor, previous: PositionedToken | undefined): boolean {
  const opensTag =
    cursor.options.markup === undefined && previous?.kind === "punct" && previous.value === "<";
  return (
    opensTag &&
    CLOSING_TAG.test(cursor.text.slice(cursor.index, cursor.index + CLOSING_TAG_LOOKAHEAD))
  );
}

function readMarkupTokens(
  cursor: Cursor,
  previous: PositionedToken | undefined,
): readonly PositionedToken[] | undefined {
  const reader = cursor.options.markup;
  return reader === undefined ? undefined : reader(cursor, previous);
}

function emitTokens(
  cursor: Cursor,
  previous: PositionedToken | undefined,
  out: PositionedToken[],
): void {
  const char = charAt(cursor, 0);
  if (char === '"' || char === "'") {
    out.push(readStringToken(cursor, char));
    return;
  }
  if (char === "`") {
    emitTemplate(cursor, out);
    return;
  }
  if (isAtomChar(char)) {
    out.push(readAtomToken(cursor));
    return;
  }
  if (
    char === "/" &&
    !isClosingTag(cursor, previous) &&
    regexCanStart(previous) &&
    trySkipRegex(cursor)
  ) {
    return;
  }
  const markup = char === "<" ? readMarkupTokens(cursor, previous) : undefined;
  if (markup !== undefined) {
    for (const token of markup) {
      out.push(token);
    }
    return;
  }
  const line = cursor.line;
  const column = columnOf(cursor);
  advance(cursor);
  out.push({ kind: "punct", value: char, line, column });
}

export function nextTokens(
  cursor: Cursor,
  previous: PositionedToken | undefined,
): readonly PositionedToken[] {
  const out: PositionedToken[] = [];
  emitTokens(cursor, previous, out);
  return out;
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
    unreadableMarkup: false,
  };
  const tokens: PositionedToken[] = [];
  while (true) {
    skipTrivia(cursor);
    if (atEnd(cursor)) {
      return {
        tokens,
        comments: cursor.comments,
        truncated: cursor.truncated,
        unreadableMarkup: cursor.unreadableMarkup,
      };
    }
    emitTokens(cursor, tokens[tokens.length - 1], tokens);
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
      return [
        {
          kind: "dynamic",
          line: token.line,
          ...(token.head !== undefined ? { head: token.head } : {}),
          ...(token.span !== undefined ? { span: token.span } : {}),
        },
      ];
    default:
      return [];
  }
}

export function tokenizeSource(text: string): SourceScan {
  const scan = scanSource(text);
  return { tokens: scan.tokens.flatMap(toSourceToken), truncated: scan.truncated };
}
