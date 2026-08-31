import type { TranslationEntry } from "@verbatra/core";
import { AdapterError } from "../errors.js";
import type { AdapterFs, BoundedReadOutcome } from "../fs-port.js";
import { outcomeToContent, readBoundedFile } from "../json/bounded-read.js";
import { isEnoent } from "../shell.js";
import { extractAppleStringsPlaceholders } from "./placeholders.js";

type Node =
  | { readonly kind: "text"; readonly text: string }
  | {
      readonly kind: "entry";
      readonly alwaysPreserved: string;
      readonly ownedByEntry: string;
      readonly description?: string;
      readonly key: string;
      readonly keyRaw: string;
      readonly value: string;
      readonly betweenKeyAndValue: string;
      readonly afterValueBeforeSemicolon: string;
    };

type LineTerminator = "\n" | "\r\n" | "\r";

const UNICODE_ESCAPE = /^[0-9a-fA-F]{4}$/;
const TRAILING_BLOCK_COMMENT = /\/\*([\s\S]*?)\*\//g;
const ATTACHED_TAIL = /^[ \t]*\r?\n?[ \t]*$/;

function isInlineWhitespace(char: string | undefined): boolean {
  return char === " " || char === "\t" || char === "\r" || char === "\n";
}

function skipInlineWhitespace(content: string, from: number): number {
  let i = from;
  while (isInlineWhitespace(content[i])) {
    i += 1;
  }
  return i;
}

function lineOf(content: string, position: number): number {
  return content.slice(0, position).split("\n").length;
}

function detectLineTerminator(content: string): LineTerminator {
  if (content.includes("\r\n")) {
    return "\r\n";
  }
  return content.includes("\r") ? "\r" : "\n";
}

function hasUtf16Bom(content: string): boolean {
  return content.charCodeAt(0) === 0xfffd && content.charCodeAt(1) === 0xfffd;
}

function assertNotUtf16(content: string): void {
  if (hasUtf16Bom(content)) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      "The file appears to be UTF-16 encoded. Apple .strings files must be UTF-8.",
    );
  }
}

function decodeUnicodeEscape(
  content: string,
  at: number,
): { readonly char: string; readonly next: number } {
  const hex = content.slice(at, at + 4);
  if (!UNICODE_ESCAPE.test(hex)) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The file has a malformed \\U unicode escape (line ${lineOf(content, at)}).`,
    );
  }
  return { char: String.fromCharCode(Number.parseInt(hex, 16)), next: at + 4 };
}

function decodeEscape(
  content: string,
  at: number,
): { readonly char: string; readonly next: number } {
  const escaped = content[at];
  switch (escaped) {
    case '"':
      return { char: '"', next: at + 1 };
    case "\\":
      return { char: "\\", next: at + 1 };
    case "n":
      return { char: "\n", next: at + 1 };
    case "t":
      return { char: "\t", next: at + 1 };
    case "U":
      return decodeUnicodeEscape(content, at + 1);
    default:
      throw new AdapterError(
        "INVALID_STRUCTURE",
        `The file has an unknown escape sequence "\\${escaped ?? ""}" (line ${lineOf(content, at)}).`,
      );
  }
}

function parseQuotedString(
  content: string,
  start: number,
): { readonly raw: string; readonly decoded: string; readonly end: number } {
  let i = start + 1;
  let decoded = "";
  while (true) {
    const char = content[i];
    if (char === undefined) {
      throw new AdapterError(
        "INVALID_STRUCTURE",
        `The file has an unterminated quoted string (line ${lineOf(content, start)}).`,
      );
    }
    if (char === '"') {
      i += 1;
      break;
    }
    if (char === "\\") {
      const token = decodeEscape(content, i + 1);
      decoded += token.char;
      i = token.next;
      continue;
    }
    decoded += char;
    i += 1;
  }
  return { raw: content.slice(start, i), decoded, end: i };
}

interface Statement {
  readonly key: string;
  readonly keyRaw: string;
  readonly value: string;
  readonly betweenKeyAndValue: string;
  readonly afterValueBeforeSemicolon: string;
  readonly end: number;
}

function parseStatement(content: string, start: number): Statement {
  const keyToken = parseQuotedString(content, start);
  const afterKey = skipInlineWhitespace(content, keyToken.end);
  if (content[afterKey] !== "=") {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The file has a statement missing its = separator (line ${lineOf(content, afterKey)}).`,
    );
  }
  const valueStart = skipInlineWhitespace(content, afterKey + 1);
  if (content[valueStart] !== '"') {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The file has a statement with no quoted value (line ${lineOf(content, valueStart)}).`,
    );
  }
  const valueToken = parseQuotedString(content, valueStart);
  const semicolonAt = skipInlineWhitespace(content, valueToken.end);
  if (content[semicolonAt] !== ";") {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The file has a statement missing its ; terminator (line ${lineOf(content, semicolonAt)}).`,
    );
  }
  return {
    key: keyToken.decoded,
    keyRaw: keyToken.raw,
    value: valueToken.decoded,
    betweenKeyAndValue: content.slice(keyToken.end, valueStart),
    afterValueBeforeSemicolon: content.slice(valueToken.end, semicolonAt),
    end: semicolonAt + 1,
  };
}

function skipComment(content: string, at: number): number {
  if (content[at + 1] === "*") {
    const closeAt = content.indexOf("*/", at + 2);
    return closeAt === -1 ? content.length : closeAt + 2;
  }
  let i = at + 2;
  while (i < content.length && content[i] !== "\n") {
    i += 1;
  }
  return i;
}

function isCommentStart(content: string, at: number): boolean {
  return content[at] === "/" && (content[at + 1] === "*" || content[at + 1] === "/");
}

interface LeadingSplit {
  readonly alwaysPreserved: string;
  readonly ownedByEntry: string;
  readonly description?: string;
}

function splitLeading(leading: string): LeadingSplit {
  let lastMatch: RegExpExecArray | null = null;
  for (const match of leading.matchAll(TRAILING_BLOCK_COMMENT)) {
    lastMatch = match;
  }
  if (lastMatch === null) {
    return { alwaysPreserved: "", ownedByEntry: leading };
  }
  const commentEnd = lastMatch.index + lastMatch[0].length;
  const tail = leading.slice(commentEnd);
  if (!ATTACHED_TAIL.test(tail)) {
    return { alwaysPreserved: leading.slice(0, commentEnd), ownedByEntry: tail };
  }
  const inner = (lastMatch[1] ?? "").trim();
  return {
    alwaysPreserved: "",
    ownedByEntry: leading,
    ...(inner !== "" ? { description: inner } : {}),
  };
}

function scanAppleStrings(content: string): readonly Node[] {
  const nodes: Node[] = [];
  let rawStart = 0;
  let i = 0;
  while (i < content.length) {
    const char = content[i];
    if (char === '"') {
      const split = splitLeading(content.slice(rawStart, i));
      const statement = parseStatement(content, i);
      nodes.push({
        kind: "entry",
        alwaysPreserved: split.alwaysPreserved,
        ownedByEntry: split.ownedByEntry,
        ...(split.description !== undefined ? { description: split.description } : {}),
        key: statement.key,
        keyRaw: statement.keyRaw,
        value: statement.value,
        betweenKeyAndValue: statement.betweenKeyAndValue,
        afterValueBeforeSemicolon: statement.afterValueBeforeSemicolon,
      });
      i = statement.end;
      rawStart = i;
      continue;
    }
    if (isCommentStart(content, i)) {
      i = skipComment(content, i);
      continue;
    }
    i += 1;
  }
  if (rawStart < content.length) {
    nodes.push({ kind: "text", text: content.slice(rawStart) });
  }
  return nodes;
}

export function parseAppleStringsEntries(
  content: string,
  namespace: string,
): Map<string, TranslationEntry> {
  assertNotUtf16(content);
  const map = new Map<string, TranslationEntry>();
  for (const node of scanAppleStrings(content)) {
    if (node.kind === "text") {
      continue;
    }
    map.set(node.key, {
      key: node.key,
      namespace,
      value: node.value,
      placeholders: extractAppleStringsPlaceholders(node.value),
      isPlural: false,
      ...(node.description !== undefined ? { description: node.description } : {}),
    });
  }
  return map;
}

function escapeChar(char: string): string {
  switch (char) {
    case "\\":
      return "\\\\";
    case '"':
      return '\\"';
    case "\n":
      return "\\n";
    case "\t":
      return "\\t";
    default:
      return char;
  }
}

function escapeValue(value: string): string {
  let out = "";
  for (const char of value) {
    out += escapeChar(char);
  }
  return out;
}

async function readDestinationNodes(
  filePath: string,
  fs: AdapterFs,
): Promise<{ readonly nodes: readonly Node[]; readonly terminator: LineTerminator }> {
  let outcome: BoundedReadOutcome;
  try {
    outcome = await readBoundedFile(fs, filePath);
  } catch (error) {
    if (isEnoent(error)) {
      return { nodes: [], terminator: "\n" };
    }
    throw new AdapterError("INVALID_STRUCTURE", "The destination file could not be read.");
  }
  const content = outcomeToContent(outcome, "The destination path is not a regular file.");
  assertNotUtf16(content);
  return { nodes: scanAppleStrings(content), terminator: detectLineTerminator(content) };
}

function endsWithNewline(text: string): boolean {
  return text === "" || text.endsWith("\n") || text.endsWith("\r");
}

export async function serializeAppleStringsEntries(
  entries: ReadonlyMap<string, TranslationEntry>,
  filePath: string,
  fs: AdapterFs,
): Promise<string> {
  const { nodes, terminator } = await readDestinationNodes(filePath, fs);
  const emitted = new Set<string>();
  const parts: string[] = [];
  for (const node of nodes) {
    if (node.kind === "text") {
      parts.push(node.text);
      continue;
    }
    parts.push(node.alwaysPreserved);
    const entry = entries.get(node.key);
    if (entry === undefined || emitted.has(node.key)) {
      continue;
    }
    parts.push(
      `${node.ownedByEntry}${node.keyRaw}${node.betweenKeyAndValue}"${escapeValue(entry.value)}"${node.afterValueBeforeSemicolon};`,
    );
    emitted.add(node.key);
  }
  let result = parts.join("");
  const appended: string[] = [];
  for (const [key, entry] of entries) {
    if (!emitted.has(key)) {
      appended.push(`"${escapeValue(key)}" = "${escapeValue(entry.value)}";${terminator}`);
    }
  }
  if (appended.length > 0) {
    if (!endsWithNewline(result)) {
      result += terminator;
    }
    result += appended.join("");
  }
  return result;
}
