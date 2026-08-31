import type { TranslationEntry } from "@verbatra/core";
import { AdapterError } from "../errors.js";
import type { AdapterFs, BoundedReadOutcome } from "../fs-port.js";
import { outcomeToContent, readBoundedFile } from "../json/bounded-read.js";
import {
  detectLineTerminator,
  isEnoent,
  type LineTerminator,
  splitPhysicalLines,
} from "../shell.js";
import { extractPropertiesPlaceholders } from "./placeholders.js";

type ParsedItem =
  | { readonly kind: "raw"; readonly text: string }
  | { readonly kind: "entry"; readonly key: string; readonly value: string };

const UNICODE_ESCAPE = /^[0-9a-fA-F]{4}$/;
const LEADING_WHITESPACE = /^[ \t\f]+/;

function isPropertiesWhitespace(char: string): boolean {
  return char === " " || char === "\t" || char === "\f";
}

function countTrailingBackslashes(line: string): number {
  let count = 0;
  for (let i = line.length - 1; i >= 0 && line[i] === "\\"; i -= 1) {
    count += 1;
  }
  return count;
}

function isContinued(line: string): boolean {
  return countTrailingBackslashes(line) % 2 === 1;
}

function isBlankLine(line: string): boolean {
  return line.trim() === "";
}

function isCommentLine(line: string): boolean {
  const trimmed = line.replace(LEADING_WHITESPACE, "");
  return trimmed.startsWith("#") || trimmed.startsWith("!");
}

function joinContinuation(
  lines: readonly string[],
  start: number,
): { readonly logical: string; readonly nextIndex: number } {
  const pieces: string[] = [];
  let index = start;
  let current = lines[start] ?? "";
  while (isContinued(current) && index + 1 < lines.length) {
    pieces.push(current.slice(0, -1));
    index += 1;
    current = (lines[index] ?? "").replace(LEADING_WHITESPACE, "");
  }
  if (isContinued(current)) {
    current = current.slice(0, -1);
  }
  pieces.push(current);
  return { logical: pieces.join(""), nextIndex: index + 1 };
}

function decodeSimpleEscape(char: string): string {
  switch (char) {
    case "t":
      return "\t";
    case "n":
      return "\n";
    case "r":
      return "\r";
    case "f":
      return "\f";
    default:
      return char;
  }
}

function decodeUnicodeEscape(raw: string, at: number): string {
  const hex = raw.slice(at, at + 4);
  if (!UNICODE_ESCAPE.test(hex)) {
    throw new AdapterError("INVALID_STRUCTURE", "The file has a malformed unicode escape.");
  }
  return String.fromCharCode(Number.parseInt(hex, 16));
}

function decodeEscapes(raw: string): string {
  let out = "";
  let i = 0;
  while (i < raw.length) {
    const char = raw[i];
    if (char !== "\\") {
      out += char;
      i += 1;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) {
      break;
    }
    if (next === "u") {
      out += decodeUnicodeEscape(raw, i + 2);
      i += 6;
      continue;
    }
    out += decodeSimpleEscape(next);
    i += 2;
  }
  return out;
}

function keyEndIndex(logical: string, from: number): number {
  let i = from;
  while (i < logical.length) {
    const char = logical[i];
    if (char === "\\") {
      i += 2;
      continue;
    }
    if (char === undefined || isPropertiesWhitespace(char) || char === "=" || char === ":") {
      break;
    }
    i += 1;
  }
  return i;
}

function skipWhitespace(logical: string, from: number): number {
  let i = from;
  while (i < logical.length) {
    const char = logical[i];
    if (char === undefined || !isPropertiesWhitespace(char)) {
      break;
    }
    i += 1;
  }
  return i;
}

function parseEntryLine(logical: string): { readonly key: string; readonly value: string } {
  const keyStart = skipWhitespace(logical, 0);
  const keyEnd = keyEndIndex(logical, keyStart);
  const afterKey = skipWhitespace(logical, keyEnd);
  const separator = logical[afterKey];
  const valueStart =
    separator === "=" || separator === ":" ? skipWhitespace(logical, afterKey + 1) : afterKey;
  return {
    key: decodeEscapes(logical.slice(keyStart, keyEnd)),
    value: decodeEscapes(logical.slice(valueStart)),
  };
}

function parseItems(content: string): ParsedItem[] {
  const lines = splitPhysicalLines(content);
  const items: ParsedItem[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (isBlankLine(line) || isCommentLine(line)) {
      items.push({ kind: "raw", text: line });
      i += 1;
      continue;
    }
    const { logical, nextIndex } = joinContinuation(lines, i);
    items.push({ kind: "entry", ...parseEntryLine(logical) });
    i = nextIndex;
  }
  return items;
}

export function parsePropertiesEntries(
  content: string,
  namespace: string,
): Map<string, TranslationEntry> {
  const map = new Map<string, TranslationEntry>();
  for (const item of parseItems(content)) {
    if (item.kind === "entry") {
      map.set(item.key, {
        key: item.key,
        namespace,
        value: item.value,
        placeholders: extractPropertiesPlaceholders(item.value),
        isPlural: false,
      });
    }
  }
  return map;
}

function unicodeEscape(code: number): string {
  return `\\u${code.toString(16).toUpperCase().padStart(4, "0")}`;
}

function escapeChar(char: string, isFirst: boolean, isKey: boolean): string {
  switch (char) {
    case "\\":
      return "\\\\";
    case "\t":
      return "\\t";
    case "\n":
      return "\\n";
    case "\r":
      return "\\r";
    case "\f":
      return "\\f";
    case " ":
      return isKey || isFirst ? "\\ " : " ";
    default:
      break;
  }
  if (isKey && (char === "=" || char === ":" || char === "#" || char === "!")) {
    return `\\${char}`;
  }
  const code = char.charCodeAt(0);
  return code < 0x20 || code > 0x7e ? unicodeEscape(code) : char;
}

function escapeString(input: string, isKey: boolean): string {
  let out = "";
  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];
    if (char !== undefined) {
      out += escapeChar(char, i === 0, isKey);
    }
  }
  return out;
}

function formatEntry(key: string, value: string): string {
  return `${escapeString(key, true)}=${escapeString(value, false)}`;
}

interface DestinationStructure {
  readonly items: ParsedItem[];
  readonly terminator: LineTerminator;
}

async function readStructure(filePath: string, fs: AdapterFs): Promise<DestinationStructure> {
  let outcome: BoundedReadOutcome;
  try {
    outcome = await readBoundedFile(fs, filePath);
  } catch (error) {
    if (isEnoent(error)) {
      return { items: [], terminator: "\n" };
    }
    throw new AdapterError("INVALID_STRUCTURE", "The destination file could not be read.");
  }
  const content = outcomeToContent(outcome, "The destination path is not a regular file.");
  return {
    items: parseItems(content),
    terminator: detectLineTerminator(content),
  };
}

export async function serializePropertiesEntries(
  entries: ReadonlyMap<string, TranslationEntry>,
  filePath: string,
  fs: AdapterFs,
): Promise<string> {
  const { items, terminator } = await readStructure(filePath, fs);
  const emitted = new Set<string>();
  const lines: string[] = [];
  for (const item of items) {
    if (item.kind === "raw") {
      lines.push(item.text);
      continue;
    }
    const entry = entries.get(item.key);
    if (entry !== undefined && !emitted.has(item.key)) {
      lines.push(formatEntry(item.key, entry.value));
      emitted.add(item.key);
    }
  }
  for (const [key, entry] of entries) {
    if (!emitted.has(key)) {
      lines.push(formatEntry(key, entry.value));
    }
  }
  return lines.length === 0 ? "" : `${lines.join(terminator)}${terminator}`;
}
