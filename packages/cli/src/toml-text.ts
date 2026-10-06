export interface TomlOpaqueValue {
  readonly raw: string;
}

export type TomlValue = string | number | boolean | TomlOpaqueValue | readonly TomlValue[];

export interface TomlHeader {
  readonly kind: "table" | "array-table";
  readonly path: readonly string[];
}

export interface TomlKeyValue {
  readonly kind: "value";
  readonly table: readonly string[];
  readonly path: readonly string[];
  readonly value: TomlValue;
}

export type TomlStatement = TomlHeader | TomlKeyValue;

interface Scan {
  readonly text: string;
  pos: number;
  depth: number;
}

export const MAX_TOML_NESTING = 64;

class TomlScanError extends Error {}

const BARE_KEY_CHAR = /[A-Za-z0-9_-]/;
const BLANK_CHARS = new Set([" ", "\t", "\r", "\n", "﻿"]);
const SCALAR_END = new Set([",", "]", "}", "#", "\n"]);
const INTEGER = /^[+-]?\d[\d_]*$/;
const FLOAT = /^[+-]?\d[\d_]*(\.\d[\d_]*)?([eE][+-]?\d[\d_]*)?$/;
const ESCAPES: Readonly<Record<string, string>> = {
  b: "\b",
  t: "\t",
  n: "\n",
  f: "\f",
  r: "\r",
  e: "\u001b",
  '"': '"',
  "\\": "\\",
};

function fail(): never {
  throw new TomlScanError();
}

function peek(scan: Scan, offset = 0): string {
  return scan.text.charAt(scan.pos + offset);
}

function atEnd(scan: Scan): boolean {
  return scan.pos >= scan.text.length;
}

function at(scan: Scan, token: string): boolean {
  return scan.text.startsWith(token, scan.pos);
}

function skipInline(scan: Scan): void {
  while (peek(scan) === " " || peek(scan) === "\t") {
    scan.pos += 1;
  }
}

function skipComment(scan: Scan): void {
  if (peek(scan) !== "#") {
    return;
  }
  while (!atEnd(scan) && peek(scan) !== "\n") {
    scan.pos += 1;
  }
}

function skipBlank(scan: Scan): void {
  while (!atEnd(scan)) {
    if (peek(scan) === "#") {
      skipComment(scan);
    } else if (BLANK_CHARS.has(peek(scan))) {
      scan.pos += 1;
    } else {
      return;
    }
  }
}

function expectLineEnd(scan: Scan): void {
  skipInline(scan);
  skipComment(scan);
  if (peek(scan) === "\r" && peek(scan, 1) === "\n") {
    scan.pos += 1;
  }
  if (!atEnd(scan) && peek(scan) !== "\n") {
    fail();
  }
}

function readUnicodeEscape(scan: Scan, digits: number): string {
  const hex = scan.text.slice(scan.pos + 1, scan.pos + 1 + digits);
  const codePoint = Number.parseInt(hex, 16);
  if (!/^[0-9A-Fa-f]+$/.test(hex) || hex.length !== digits || codePoint > 0x10ffff) {
    fail();
  }
  scan.pos += 1 + digits;
  return String.fromCodePoint(codePoint);
}

function readEscape(scan: Scan): string {
  const char = peek(scan);
  const simple = ESCAPES[char];
  if (simple !== undefined) {
    scan.pos += 1;
    return simple;
  }
  if (char === "u" || char === "U") {
    return readUnicodeEscape(scan, char === "u" ? 4 : 8);
  }
  return fail();
}

function readBasicString(scan: Scan): string {
  scan.pos += 1;
  let value = "";
  while (!atEnd(scan)) {
    const char = peek(scan);
    scan.pos += 1;
    if (char === '"') {
      return value;
    }
    if (char === "\n") {
      fail();
    }
    value += char === "\\" ? readEscape(scan) : char;
  }
  return fail();
}

function readLiteralString(scan: Scan): string {
  const close = scan.text.indexOf("'", scan.pos + 1);
  const newline = scan.text.indexOf("\n", scan.pos + 1);
  if (close === -1 || (newline !== -1 && newline < close)) {
    fail();
  }
  const value = scan.text.slice(scan.pos + 1, close);
  scan.pos = close + 1;
  return value;
}

function skipTrailingQuotes(scan: Scan, quote: string): void {
  for (let extra = 0; extra < 2 && peek(scan) === quote; extra += 1) {
    scan.pos += 1;
  }
}

function skipMultilineString(scan: Scan, delimiter: '"""' | "'''"): TomlOpaqueValue {
  const start = scan.pos;
  scan.pos += 3;
  while (!atEnd(scan)) {
    if (at(scan, delimiter)) {
      scan.pos += 3;
      skipTrailingQuotes(scan, delimiter.charAt(0));
      return { raw: scan.text.slice(start, scan.pos) };
    }
    scan.pos += delimiter === '"""' && peek(scan) === "\\" ? 2 : 1;
  }
  return fail();
}

function readKeyPart(scan: Scan): string {
  if (peek(scan) === '"') {
    return readBasicString(scan);
  }
  if (peek(scan) === "'") {
    return readLiteralString(scan);
  }
  const start = scan.pos;
  while (BARE_KEY_CHAR.test(peek(scan))) {
    scan.pos += 1;
  }
  return scan.pos === start ? fail() : scan.text.slice(start, scan.pos);
}

function readKey(scan: Scan): readonly string[] {
  const parts: string[] = [];
  for (;;) {
    skipInline(scan);
    parts.push(readKeyPart(scan));
    skipInline(scan);
    if (peek(scan) !== ".") {
      return parts;
    }
    scan.pos += 1;
  }
}

function scalar(raw: string): TomlValue {
  if (raw === "true" || raw === "false") {
    return raw === "true";
  }
  if (INTEGER.test(raw) || FLOAT.test(raw)) {
    return Number(raw.replaceAll("_", ""));
  }
  return { raw };
}

function readScalar(scan: Scan): TomlValue {
  const start = scan.pos;
  while (!atEnd(scan) && !SCALAR_END.has(peek(scan))) {
    scan.pos += 1;
  }
  const raw = scan.text.slice(start, scan.pos).trim();
  return raw === "" ? fail() : scalar(raw);
}

function nested<T>(scan: Scan, read: (scan: Scan) => T): T {
  if (scan.depth >= MAX_TOML_NESTING) {
    fail();
  }
  scan.depth += 1;
  const value = read(scan);
  scan.depth -= 1;
  return value;
}

function readArray(scan: Scan): readonly TomlValue[] {
  scan.pos += 1;
  const items: TomlValue[] = [];
  for (;;) {
    skipBlank(scan);
    if (peek(scan) === "]") {
      scan.pos += 1;
      return items;
    }
    items.push(readValue(scan));
    skipBlank(scan);
    if (peek(scan) === ",") {
      scan.pos += 1;
    } else if (peek(scan) !== "]") {
      fail();
    }
  }
}

function readInlineTable(scan: Scan): TomlOpaqueValue {
  const start = scan.pos;
  scan.pos += 1;
  for (;;) {
    skipBlank(scan);
    if (peek(scan) === "}") {
      scan.pos += 1;
      return { raw: scan.text.slice(start, scan.pos) };
    }
    readAssignment(scan);
    skipBlank(scan);
    if (peek(scan) === ",") {
      scan.pos += 1;
    } else if (peek(scan) !== "}") {
      fail();
    }
  }
}

function readValue(scan: Scan): TomlValue {
  if (at(scan, '"""') || at(scan, "'''")) {
    return skipMultilineString(scan, at(scan, '"""') ? '"""' : "'''");
  }
  switch (peek(scan)) {
    case '"':
      return readBasicString(scan);
    case "'":
      return readLiteralString(scan);
    case "[":
      return nested(scan, readArray);
    case "{":
      return nested(scan, readInlineTable);
    default:
      return readScalar(scan);
  }
}

function readAssignment(scan: Scan): {
  readonly key: readonly string[];
  readonly value: TomlValue;
} {
  const key = readKey(scan);
  if (peek(scan) !== "=") {
    fail();
  }
  scan.pos += 1;
  skipInline(scan);
  return { key, value: readValue(scan) };
}

function readHeader(scan: Scan): TomlHeader {
  const array = at(scan, "[[");
  scan.pos += array ? 2 : 1;
  const path = readKey(scan);
  const close = array ? "]]" : "]";
  if (!at(scan, close)) {
    fail();
  }
  scan.pos += close.length;
  expectLineEnd(scan);
  return { kind: array ? "array-table" : "table", path };
}

function readStatements(scan: Scan): readonly TomlStatement[] {
  const statements: TomlStatement[] = [];
  let table: readonly string[] = [];
  for (skipBlank(scan); !atEnd(scan); skipBlank(scan)) {
    if (peek(scan) === "[") {
      const header = readHeader(scan);
      table = header.path;
      statements.push(header);
      continue;
    }
    const { key, value } = readAssignment(scan);
    expectLineEnd(scan);
    statements.push({ kind: "value", table, path: [...table, ...key], value });
  }
  return statements;
}

export function scanToml(text: string): readonly TomlStatement[] | undefined {
  try {
    return readStatements({ text, pos: 0, depth: 0 });
  } catch (error) {
    if (error instanceof TomlScanError) {
      return undefined;
    }
    throw error;
  }
}

function renderValue(value: unknown): string {
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(renderValue).join(", ")}]`;
  }
  throw new TypeError(`cannot render ${typeof value} as a TOML value`);
}

export function renderTomlTable(path: readonly string[], entries: object, eol: string): string {
  const lines = Object.entries(entries).map(([key, value]) => `${key} = ${renderValue(value)}`);
  return [`[${path.join(".")}]`, ...lines, ""].join(eol);
}
