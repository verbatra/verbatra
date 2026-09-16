import type { TranslationEntry } from "@verbatra/core";
import { AdapterError } from "../errors.js";
import type { AdapterFs, BoundedReadOutcome } from "../fs-port.js";
import { outcomeToContent, readBoundedFile } from "../json/bounded-read.js";
import { decodeKeyToSegments, encodeSegment, joinEncodedSegments } from "../json/key-encoding.js";
import {
  detectLineTerminator,
  isEnoent,
  type LineTerminator,
  splitPhysicalLines,
} from "../shell.js";
import { extractSingleBraceTokens } from "../single-brace/tokens.js";

interface RawItem {
  readonly kind: "raw";
  readonly text: string;
}

interface SectionItem {
  readonly kind: "section";
  readonly text: string;
  readonly name: string;
}

interface EntryItem {
  readonly kind: "entry";
  readonly text: string;
  readonly key: string;
  readonly value: string;
  readonly valueStart: number;
  readonly valueEnd: number;
  readonly quoted: boolean;
}

type Item = RawItem | SectionItem | EntryItem;

const LEADING_WHITESPACE = /^[ \t]+/;
const COMMENT_START = /^[;#]/;
const NEEDS_QUOTING = /^[ \t"]|[ \t]$|[\r\n]/;
const UNREPRESENTABLE_KEY = /[=\r\n]|^[[;#]/;
const UNREPRESENTABLE_SECTION = /[[\]\r\n]/;

function isComment(line: string): boolean {
  return COMMENT_START.test(line.replace(LEADING_WHITESPACE, ""));
}

function sectionNameOf(line: string): string {
  const trimmed = line.trim();
  const close = trimmed.indexOf("]");
  if (close === -1) {
    throw new AdapterError("INVALID_STRUCTURE", "A section header is not closed with a bracket.");
  }
  const trailing = trimmed.slice(close + 1).trim();
  if (trailing !== "" && !COMMENT_START.test(trailing)) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      "A section header is followed by text that is not a comment.",
    );
  }
  const name = trimmed.slice(1, close).trim();
  if (name === "") {
    throw new AdapterError("INVALID_STRUCTURE", "A section header has an empty name.");
  }
  return name;
}

function decodeEscape(char: string): string {
  switch (char) {
    case "n":
      return "\n";
    case "r":
      return "\r";
    case "t":
      return "\t";
    default:
      return char;
  }
}

function decodeQuoted(raw: string): string {
  let out = "";
  let i = 0;
  while (i < raw.length) {
    const char = raw[i];
    if (char !== "\\") {
      out += char ?? "";
      i += 1;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) {
      break;
    }
    out += decodeEscape(next);
    i += 2;
  }
  return out;
}

function endOfValue(line: string, from: number): number {
  let end = line.length;
  while (end > from) {
    const char = line[end - 1];
    if (char !== " " && char !== "\t") {
      break;
    }
    end -= 1;
  }
  return end;
}

function pathKey(section: string | undefined, key: string): string {
  return section === undefined
    ? encodeSegment(key)
    : joinEncodedSegments([encodeSegment(section), encodeSegment(key)]);
}

function parseEntryLine(line: string, section: string | undefined): Item {
  const separator = line.indexOf("=");
  if (separator === -1) {
    return { kind: "raw", text: line };
  }
  const key = line.slice(0, separator).trim();
  if (key === "") {
    return { kind: "raw", text: line };
  }
  const rest = line.slice(separator + 1);
  const valueStart = separator + 1 + (rest.length - rest.replace(LEADING_WHITESPACE, "").length);
  const valueEnd = endOfValue(line, valueStart);
  const raw = line.slice(valueStart, valueEnd);
  const quoted = raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"');
  return {
    kind: "entry",
    text: line,
    key: pathKey(section, key),
    value: quoted ? decodeQuoted(raw.slice(1, -1)) : raw,
    valueStart,
    valueEnd,
    quoted,
  };
}

function parseItems(content: string): Item[] {
  const items: Item[] = [];
  let section: string | undefined;
  for (const line of splitPhysicalLines(content)) {
    const trimmed = line.trim();
    if (trimmed === "" || isComment(line)) {
      items.push({ kind: "raw", text: line });
    } else if (trimmed.startsWith("[")) {
      section = sectionNameOf(line);
      items.push({ kind: "section", text: line, name: section });
    } else {
      items.push(parseEntryLine(line, section));
    }
  }
  return items;
}

export function parseIniEntries(content: string, namespace: string): Map<string, TranslationEntry> {
  const map = new Map<string, TranslationEntry>();
  for (const item of parseItems(content)) {
    if (item.kind === "entry") {
      map.set(item.key, {
        key: item.key,
        namespace,
        value: item.value,
        placeholders: extractSingleBraceTokens(item.value),
        isPlural: false,
      });
    }
  }
  return map;
}

function escapeQuoted(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll('"', '\\"')
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t");
}

function renderValue(value: string, quoted: boolean): string {
  return quoted || NEEDS_QUOTING.test(value) ? `"${escapeQuoted(value)}"` : value;
}

function patchLine(item: EntryItem, value: string): string {
  const head = item.text.slice(0, item.valueStart);
  return `${head}${renderValue(value, item.quoted)}${item.text.slice(item.valueEnd)}`;
}

interface Block {
  readonly section: string | undefined;
  readonly lines: string[];
}

function buildBlocks(
  items: readonly Item[],
  entries: ReadonlyMap<string, TranslationEntry>,
  emitted: Set<string>,
): Block[] {
  let current: Block = { section: undefined, lines: [] };
  const blocks: Block[] = [current];
  for (const item of items) {
    if (item.kind === "section") {
      current = { section: item.name, lines: [item.text] };
      blocks.push(current);
    } else if (item.kind === "raw") {
      current.lines.push(item.text);
    } else {
      const entry = entries.get(item.key);
      if (entry !== undefined && !emitted.has(item.key)) {
        emitted.add(item.key);
        current.lines.push(patchLine(item, entry.value));
      }
    }
  }
  return blocks;
}

function splitKey(key: string): { readonly section: string | undefined; readonly name: string } {
  const [first = "", ...rest] = decodeKeyToSegments(key);
  return rest.length === 0
    ? { section: undefined, name: first }
    : { section: first, name: rest.join(".") };
}

function assertRepresentable(section: string | undefined, name: string): void {
  if (name.trim() === "" || UNREPRESENTABLE_KEY.test(name)) {
    throw new AdapterError("INVALID_STRUCTURE", "A key cannot be written as an INI entry name.");
  }
  if (section !== undefined && UNREPRESENTABLE_SECTION.test(section)) {
    throw new AdapterError("INVALID_STRUCTURE", "A key cannot be written as an INI section name.");
  }
}

function insertIntoBlock(block: Block, line: string): void {
  let at = block.lines.length;
  while (at > 0 && (block.lines[at - 1] ?? "").trim() === "") {
    at -= 1;
  }
  block.lines.splice(at, 0, line);
}

function blockFor(blocks: Block[], section: string | undefined): Block {
  const existing = blocks.find((block) => block.section === section);
  if (existing !== undefined) {
    return existing;
  }
  const created: Block = { section, lines: [`[${section ?? ""}]`] };
  blocks.push(created);
  return created;
}

function appendUnmatched(
  blocks: Block[],
  entries: ReadonlyMap<string, TranslationEntry>,
  emitted: ReadonlySet<string>,
): void {
  for (const [key, entry] of entries) {
    if (emitted.has(key)) {
      continue;
    }
    const { section, name } = splitKey(key);
    assertRepresentable(section, name);
    insertIntoBlock(blockFor(blocks, section), `${name}=${renderValue(entry.value, false)}`);
  }
}

interface DestinationStructure {
  readonly items: readonly Item[];
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
    if (error instanceof AdapterError) {
      throw error;
    }
    throw new AdapterError("INVALID_STRUCTURE", "The destination file could not be read.");
  }
  const content = outcomeToContent(outcome, "The destination path is not a regular file.");
  return { items: parseItems(content), terminator: detectLineTerminator(content) };
}

export async function serializeIniEntries(
  entries: ReadonlyMap<string, TranslationEntry>,
  filePath: string,
  fs: AdapterFs,
): Promise<string> {
  const { items, terminator } = await readStructure(filePath, fs);
  const emitted = new Set<string>();
  const blocks = buildBlocks(items, entries, emitted);
  appendUnmatched(blocks, entries, emitted);
  const lines = blocks.flatMap((block) => block.lines);
  return lines.length === 0 ? "" : `${lines.join(terminator)}${terminator}`;
}
