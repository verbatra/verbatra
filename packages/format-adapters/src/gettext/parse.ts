import type { TranslationEntry } from "@verbatra/core";
import { AdapterError } from "../errors.js";
import { decodeCString } from "./c-string.js";
import { composeKey } from "./key-encoding.js";
import { extractGettextPlaceholders } from "./placeholders.js";
import { parseHeaderFields, parseNplurals } from "./plural-forms.js";

export type LineTerminator = "\n" | "\r\n" | "\r";

export function detectLineTerminator(content: string): LineTerminator {
  if (content.includes("\r\n")) {
    return "\r\n";
  }
  return content.includes("\r") ? "\r" : "\n";
}

export function splitPhysicalLines(content: string): string[] {
  if (content === "") {
    return [];
  }
  const lines = content.split(/\r\n|\r|\n/);
  if (/(?:\r\n|\r|\n)$/.test(content)) {
    lines.pop();
  }
  return lines;
}

export function joinSelfTerminated(lines: readonly string[], terminator: string): string {
  return lines.map((line) => `${line}${terminator}`).join("");
}

function isCommentLine(line: string): boolean {
  return line.trimStart().startsWith("#");
}

function isObsoleteLine(line: string): boolean {
  return line.trimStart().startsWith("#~");
}

function isExtractedCommentLine(line: string): boolean {
  return line.trimStart().startsWith("#.");
}

function extractedCommentText(line: string): string {
  const rest = line.trimStart().slice(2);
  return rest.startsWith(" ") ? rest.slice(1) : rest;
}

function parseQuotedOnLine(line: string, lineNo: number): string {
  const trimmed = line.trim();
  /* v8 ignore start -- defensive: both call sites (gatherStringValue's keyword line and its
   * continuation-line check via isBareQuotedLine) already verify a leading quote before calling. */
  if (trimmed[0] !== '"') {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The .po/.pot file expected a quoted string (line ${lineNo}).`,
    );
  }
  /* v8 ignore stop */
  let i = 1;
  let raw = "";
  while (i < trimmed.length && trimmed[i] !== '"') {
    if (trimmed[i] === "\\") {
      const next = trimmed[i + 1];
      if (next === undefined) {
        throw new AdapterError(
          "INVALID_STRUCTURE",
          `The .po/.pot file has an unterminated escape in a quoted string (line ${lineNo}).`,
        );
      }
      raw += trimmed[i] + next;
      i += 2;
      continue;
    }
    raw += trimmed[i];
    i += 1;
  }
  if (trimmed[i] !== '"') {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The .po/.pot file has an unterminated quoted string (line ${lineNo}).`,
    );
  }
  if (i !== trimmed.length - 1) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The .po/.pot file has unexpected content after a quoted string (line ${lineNo}).`,
    );
  }
  return decodeCString(raw, lineNo);
}

function isBareQuotedLine(line: string): boolean {
  return line.trim().startsWith('"');
}

interface GatherResult {
  readonly decoded: string;
  readonly nextIndex: number;
}

function gatherStringValue(lines: readonly string[], start: number, keyword: string): GatherResult {
  const firstLine = (lines[start] ?? "").trim();
  const rest = firstLine.slice(keyword.length).trim();
  let decoded = parseQuotedOnLine(rest, start + 1);
  let i = start + 1;
  while (i < lines.length && isBareQuotedLine(lines[i] ?? "")) {
    decoded += parseQuotedOnLine((lines[i] ?? "").trim(), i + 1);
    i += 1;
  }
  return { decoded, nextIndex: i };
}

const MSGSTR_INDEX = /^msgstr\[(\d+)\]/;

interface ParsedRecord {
  readonly msgctxt: string | undefined;
  readonly msgid: string;
  readonly msgidPlural: string | undefined;
  readonly description: string | undefined;
  readonly prefixRaw: string;
  readonly singularValue: string | undefined;
  readonly pluralValues: ReadonlyMap<number, string> | undefined;
  readonly entryEndIndex: number;
}

function parseLeadingComments(
  lines: readonly string[],
  start: number,
): { readonly description: string | undefined; readonly next: number } {
  const descriptionParts: string[] = [];
  let i = start;
  while (i < lines.length && isCommentLine(lines[i] ?? "")) {
    const line = lines[i] ?? "";
    if (isExtractedCommentLine(line)) {
      descriptionParts.push(extractedCommentText(line));
    }
    i += 1;
  }
  return {
    description: descriptionParts.length > 0 ? descriptionParts.join("\n") : undefined,
    next: i,
  };
}

function parseOptionalMsgctxt(
  lines: readonly string[],
  start: number,
): { readonly msgctxt: string | undefined; readonly next: number } {
  if (!/^msgctxt\s+"/.test((lines[start] ?? "").trim())) {
    return { msgctxt: undefined, next: start };
  }
  const result = gatherStringValue(lines, start, "msgctxt");
  return { msgctxt: result.decoded, next: result.nextIndex };
}

function parsePluralMsgstrs(
  lines: readonly string[],
  start: number,
  msgid: string,
): { readonly values: Map<number, string>; readonly next: number } {
  const values = new Map<number, string>();
  let i = start;
  while (/^msgstr\[\d+\]\s*"/.test((lines[i] ?? "").trim())) {
    const trimmed = (lines[i] ?? "").trim();
    const match = MSGSTR_INDEX.exec(trimmed);
    const index = Number(match?.[1] ?? "0");
    if (index !== values.size) {
      throw new AdapterError(
        "INVALID_STRUCTURE",
        `The .po/.pot file has a non-contiguous plural index for msgid "${msgid}": expected ` +
          `msgstr[${values.size}], found msgstr[${index}] (line ${i + 1}).`,
      );
    }
    const result = gatherStringValue(lines, i, `msgstr[${index}]`);
    values.set(index, result.decoded);
    i = result.nextIndex;
  }
  if (values.size === 0) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The .po/.pot file is missing msgstr[n] forms for the plural msgid "${msgid}" (line ${start + 1}).`,
    );
  }
  return { values, next: i };
}

function parseRecord(lines: readonly string[], start: number, terminator: string): ParsedRecord {
  const comments = parseLeadingComments(lines, start);
  let i = comments.next;
  if (i >= lines.length) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The .po/.pot file ends after a comment block with no entry following it (line ${i}).`,
    );
  }
  const ctx = parseOptionalMsgctxt(lines, i);
  i = ctx.next;
  if (!/^msgid\s+"/.test((lines[i] ?? "").trim())) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The .po/.pot file expected "msgid" (line ${i + 1}).`,
    );
  }
  const msgidResult = gatherStringValue(lines, i, "msgid");
  i = msgidResult.nextIndex;

  let msgidPlural: string | undefined;
  if (/^msgid_plural\s+"/.test((lines[i] ?? "").trim())) {
    const result = gatherStringValue(lines, i, "msgid_plural");
    msgidPlural = result.decoded;
    i = result.nextIndex;
  }

  const prefixRaw = joinSelfTerminated(lines.slice(start, i), terminator);

  if (msgidPlural !== undefined) {
    const plural = parsePluralMsgstrs(lines, i, msgidResult.decoded);
    return {
      msgctxt: ctx.msgctxt,
      msgid: msgidResult.decoded,
      msgidPlural,
      description: comments.description,
      prefixRaw,
      singularValue: undefined,
      pluralValues: plural.values,
      entryEndIndex: plural.next,
    };
  }

  if (!/^msgstr\s+"/.test((lines[i] ?? "").trim())) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The .po/.pot file expected "msgstr" for msgid "${msgidResult.decoded}" (line ${i + 1}).`,
    );
  }
  const msgstrResult = gatherStringValue(lines, i, "msgstr");
  return {
    msgctxt: ctx.msgctxt,
    msgid: msgidResult.decoded,
    msgidPlural: undefined,
    description: comments.description,
    prefixRaw,
    singularValue: msgstrResult.decoded,
    pluralValues: undefined,
    entryEndIndex: msgstrResult.nextIndex,
  };
}

export interface PoEntryNode {
  readonly kind: "entry";
  readonly prefixRaw: string;
  readonly msgctxt: string | undefined;
  readonly msgid: string;
  readonly msgidPlural: string | undefined;
  readonly description: string | undefined;
  readonly singularValue: string | undefined;
  readonly pluralValues: ReadonlyMap<number, string> | undefined;
}

export interface PoRawNode {
  readonly kind: "raw";
  readonly text: string;
}

export type PoNode = PoEntryNode | PoRawNode;

export interface PoDocument {
  readonly nodes: readonly PoNode[];
  readonly terminator: LineTerminator;
  readonly headerFields: ReadonlyMap<string, string> | undefined;
}

function isHeaderRecord(record: ParsedRecord): boolean {
  return record.msgctxt === undefined && record.msgid === "" && record.msgidPlural === undefined;
}

export function scanPo(content: string): PoDocument {
  const terminator = detectLineTerminator(content);
  const lines = splitPhysicalLines(content);
  const nodes: PoNode[] = [];
  let raw: string[] = [];
  let headerFields: ReadonlyMap<string, string> | undefined;

  const flushRaw = (): void => {
    if (raw.length > 0) {
      nodes.push({ kind: "raw", text: joinSelfTerminated(raw, terminator) });
      raw = [];
    }
  };

  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? "";
    if (line.trim() === "") {
      raw.push(line);
      i += 1;
      continue;
    }
    if (isObsoleteLine(line)) {
      while (i < lines.length && isObsoleteLine(lines[i] ?? "")) {
        raw.push(lines[i] ?? "");
        i += 1;
      }
      continue;
    }
    const record = parseRecord(lines, i, terminator);
    if (isHeaderRecord(record)) {
      flushRaw();
      nodes.push({
        kind: "raw",
        text: joinSelfTerminated(lines.slice(i, record.entryEndIndex), terminator),
      });
      headerFields = parseHeaderFields(record.singularValue ?? "");
      i = record.entryEndIndex;
      continue;
    }
    flushRaw();
    nodes.push({
      kind: "entry",
      prefixRaw: record.prefixRaw,
      msgctxt: record.msgctxt,
      msgid: record.msgid,
      msgidPlural: record.msgidPlural,
      description: record.description,
      singularValue: record.singularValue,
      pluralValues: record.pluralValues,
    });
    i = record.entryEndIndex;
  }
  flushRaw();
  return { nodes, terminator, headerFields };
}

function assertPluralIndicesInRange(
  node: PoEntryNode,
  pluralValues: ReadonlyMap<number, string>,
  nplurals: number | undefined,
): number {
  if (nplurals === undefined) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The msgid "${node.msgid}" has plural forms, but the file has no "Plural-Forms" header ` +
        "declaring nplurals.",
    );
  }
  const maxIndex = Math.max(...pluralValues.keys());
  if (maxIndex >= nplurals) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The msgid "${node.msgid}" has msgstr[${maxIndex}], but the header declares nplurals=${nplurals} ` +
        `(valid indices 0..${nplurals - 1}).`,
    );
  }
  return maxIndex;
}

function addPluralEntries(
  entries: Map<string, TranslationEntry>,
  node: PoEntryNode,
  pluralValues: ReadonlyMap<number, string>,
  namespace: string,
  nplurals: number | undefined,
): void {
  assertPluralIndicesInRange(node, pluralValues, nplurals);
  for (const [index, value] of pluralValues) {
    const key = composeKey(node.msgctxt, node.msgid, index);
    entries.set(key, {
      key,
      namespace,
      value,
      placeholders: extractGettextPlaceholders(value),
      isPlural: true,
      ...(node.msgidPlural !== undefined ? { meaning: node.msgidPlural } : {}),
      ...(node.description !== undefined ? { description: node.description } : {}),
    });
  }
}

function addSingularEntry(
  entries: Map<string, TranslationEntry>,
  node: PoEntryNode,
  namespace: string,
): void {
  const key = composeKey(node.msgctxt, node.msgid);
  const value = node.singularValue ?? "";
  entries.set(key, {
    key,
    namespace,
    value,
    placeholders: extractGettextPlaceholders(value),
    isPlural: false,
    ...(node.description !== undefined ? { description: node.description } : {}),
  });
}

function headerNplurals(doc: PoDocument): number | undefined {
  if (doc.headerFields === undefined) {
    return undefined;
  }
  return parseNplurals(doc.headerFields.get("Plural-Forms") ?? "");
}

export function parsePoEntries(content: string, namespace: string): Map<string, TranslationEntry> {
  const doc = scanPo(content);
  const nplurals = headerNplurals(doc);
  const entries = new Map<string, TranslationEntry>();
  for (const node of doc.nodes) {
    if (node.kind !== "entry") {
      continue;
    }
    if (node.pluralValues !== undefined) {
      addPluralEntries(entries, node, node.pluralValues, namespace, nplurals);
      continue;
    }
    addSingularEntry(entries, node, namespace);
  }
  return entries;
}
