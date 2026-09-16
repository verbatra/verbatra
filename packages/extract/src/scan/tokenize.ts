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

interface Cursor {
  readonly text: string;
  index: number;
  line: number;
  truncated: boolean;
}

export interface SourceScan {
  readonly tokens: readonly SourceToken[];
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

const CLOSING_TAG = /^\/[A-Za-z0-9\-.:]*\s*>/;

const CLOSING_TAG_LOOKAHEAD = 256;

function charAt(cursor: Cursor, offset: number): string {
  return cursor.text[cursor.index + offset] ?? "";
}

function atEnd(cursor: Cursor): boolean {
  return cursor.index >= cursor.text.length;
}

function advance(cursor: Cursor): string {
  const char = charAt(cursor, 0);
  if (char === "\n") {
    cursor.line += 1;
  }
  cursor.index += 1;
  return char;
}

function isAtomChar(char: string): boolean {
  return /[A-Za-z0-9_$]/.test(char);
}

function isWhitespace(char: string): boolean {
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

function skipTrivia(cursor: Cursor): void {
  while (!atEnd(cursor)) {
    const char = charAt(cursor, 0);
    if (isWhitespace(char)) {
      advance(cursor);
    } else if (char === "/" && charAt(cursor, 1) === "/") {
      skipLineComment(cursor);
    } else if (char === "/" && charAt(cursor, 1) === "*") {
      skipBlockComment(cursor);
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

function readStringToken(cursor: Cursor, quote: string): SourceToken {
  const line = cursor.line;
  const start = cursor.index;
  cursor.index += 1;
  let value = "";
  while (!atEnd(cursor)) {
    const char = charAt(cursor, 0);
    if (char === "\\") {
      value += readEscape(cursor);
    } else if (char === quote) {
      cursor.index += 1;
      return { kind: "string", value, line };
    } else if (char === "\n") {
      break;
    } else {
      value += advance(cursor);
    }
  }
  cursor.index = start + 1;
  cursor.line = line;
  return { kind: "punct", value: quote, line };
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

interface TemplateParts {
  readonly line: number;
  readonly head: string;
  readonly staticValue: string;
  readonly expressions: readonly { readonly text: string; readonly line: number }[];
  readonly dynamic: boolean;
}

function readTemplateParts(cursor: Cursor): TemplateParts {
  const line = cursor.line;
  cursor.index += 1;
  let staticValue = "";
  let head: string | undefined;
  let dynamic = false;
  const expressions: { text: string; line: number }[] = [];
  while (!atEnd(cursor)) {
    const char = charAt(cursor, 0);
    if (char === "\\") {
      staticValue += readEscape(cursor);
    } else if (char === "`") {
      cursor.index += 1;
      return { line, head: head ?? staticValue, staticValue, expressions, dynamic };
    } else if (char === "$" && charAt(cursor, 1) === "{") {
      head ??= staticValue;
      dynamic = true;
      cursor.index += 2;
      const start = cursor.index;
      const startLine = cursor.line;
      skipBalancedExpression(cursor);
      expressions.push({ text: cursor.text.slice(start, cursor.index - 1), line: startLine });
    } else {
      staticValue += advance(cursor);
    }
  }
  cursor.truncated = true;
  return { line, head: head ?? staticValue, staticValue, expressions, dynamic: true };
}

function shiftLine(token: SourceToken, offset: number): SourceToken {
  return { ...token, line: token.line + offset };
}

function readExpressionTokens(
  cursor: Cursor,
  expression: { readonly text: string; readonly line: number },
): readonly SourceToken[] {
  const scan = tokenizeSource(expression.text);
  if (scan.truncated) {
    cursor.truncated = true;
  }
  return scan.tokens.map((token) => shiftLine(token, expression.line - 1));
}

function readTemplateTokens(cursor: Cursor): readonly SourceToken[] {
  const parts = readTemplateParts(cursor);
  if (!parts.dynamic) {
    return [{ kind: "string", value: parts.staticValue, line: parts.line }];
  }
  const inner = parts.expressions.flatMap((expression) => readExpressionTokens(cursor, expression));
  return [{ kind: "dynamic", line: parts.line, head: parts.head, span: inner.length }, ...inner];
}

function readAtomToken(cursor: Cursor): SourceToken {
  const line = cursor.line;
  const start = cursor.index;
  while (!atEnd(cursor) && isAtomChar(charAt(cursor, 0))) {
    cursor.index += 1;
  }
  return { kind: "ident", value: cursor.text.slice(start, cursor.index), line };
}

function regexCanStart(previous: SourceToken | undefined): boolean {
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

function isClosingTag(cursor: Cursor, previous: SourceToken | undefined): boolean {
  const opensTag = previous?.kind === "punct" && previous.value === "<";
  return (
    opensTag &&
    CLOSING_TAG.test(cursor.text.slice(cursor.index, cursor.index + CLOSING_TAG_LOOKAHEAD))
  );
}

function nextTokens(cursor: Cursor, previous: SourceToken | undefined): readonly SourceToken[] {
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
  if (
    char === "/" &&
    !isClosingTag(cursor, previous) &&
    regexCanStart(previous) &&
    trySkipRegex(cursor)
  ) {
    return [];
  }
  const line = cursor.line;
  advance(cursor);
  return [{ kind: "punct", value: char, line }];
}

export function tokenizeSource(text: string): SourceScan {
  const cursor: Cursor = { text, index: 0, line: 1, truncated: false };
  const tokens: SourceToken[] = [];
  while (true) {
    skipTrivia(cursor);
    if (atEnd(cursor)) {
      return { tokens, truncated: cursor.truncated };
    }
    const produced = nextTokens(cursor, tokens[tokens.length - 1]);
    tokens.push(...produced);
  }
}
