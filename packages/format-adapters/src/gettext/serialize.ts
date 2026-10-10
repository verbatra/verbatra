import { posixSpelling, type TranslationEntry } from "@verbatra/core";
import type { WriteContext } from "../adapter.js";
import { AdapterError } from "../errors.js";
import type { AdapterFs, BoundedReadOutcome } from "../fs-port.js";
import { outcomeToContent, readBoundedFile } from "../json/bounded-read.js";
import { isEnoent } from "../shell.js";
import { encodeCString } from "./c-string.js";
import { composeKey, decomposeKey } from "./key-encoding.js";
import { joinSelfTerminated, type PoDocument, scanPo } from "./parse.js";
import { defaultPluralFormsExpression } from "./plural-forms.js";

interface NewGroup {
  readonly msgctxt: string | undefined;
  readonly msgid: string;
  msgidPlural: string | undefined;
  readonly values: Map<number | undefined, string>;
}

function groupEntries(entries: ReadonlyMap<string, TranslationEntry>): Map<string, NewGroup> {
  const groups = new Map<string, NewGroup>();
  for (const [key, entry] of entries) {
    const decomposed = decomposeKey(key);
    const groupKey = composeKey(decomposed.msgctxt, decomposed.msgid);
    let group = groups.get(groupKey);
    if (group === undefined) {
      group = {
        msgctxt: decomposed.msgctxt,
        msgid: decomposed.msgid,
        msgidPlural: undefined,
        values: new Map(),
      };
      groups.set(groupKey, group);
    }
    if (decomposed.pluralIndex !== undefined && entry.meaning !== undefined) {
      group.msgidPlural = entry.meaning;
    }
    group.values.set(decomposed.pluralIndex, entry.value);
  }
  return groups;
}

function renderNewGroup(group: NewGroup, terminator: string): string {
  const lines: string[] = [];
  if (group.msgctxt !== undefined) {
    lines.push(`msgctxt "${encodeCString(group.msgctxt)}"`);
  }
  lines.push(`msgid "${encodeCString(group.msgid)}"`);
  const pluralPairs = [...group.values.entries()]
    .filter((pair): pair is [number, string] => pair[0] !== undefined)
    .sort((a, b) => a[0] - b[0]);
  if (pluralPairs.length > 0) {
    lines.push(`msgid_plural "${encodeCString(group.msgidPlural ?? group.msgid)}"`);
    for (const [index, value] of pluralPairs) {
      lines.push(`msgstr[${index}] "${encodeCString(value)}"`);
    }
  } else {
    const singular = group.values.get(undefined);
    /* v8 ignore next -- defensive: a group always holds at least one value, and when no plural
     * pair exists the only possible key is the singular "undefined" one. */
    lines.push(`msgstr "${encodeCString(singular ?? "")}"`);
  }
  return joinSelfTerminated(lines, terminator);
}

function renderMsgstrLine(index: number | undefined, value: string, terminator: string): string {
  const keyword = index === undefined ? "msgstr" : `msgstr[${index}]`;
  return `${keyword} "${encodeCString(value)}"${terminator}`;
}

function withBlankLine(text: string, terminator: string): string {
  if (text === "" || text.endsWith(`${terminator}${terminator}`)) {
    return text;
  }
  return text.endsWith(terminator) ? `${text}${terminator}` : `${text}${terminator}${terminator}`;
}

function appendGroups(text: string, groups: Iterable<NewGroup>, terminator: string): string {
  let out = text;
  for (const group of groups) {
    out = `${withBlankLine(out, terminator)}${renderNewGroup(group, terminator)}`;
  }
  return out;
}

function appendNewEntries(
  text: string,
  entries: ReadonlyMap<string, TranslationEntry>,
  emitted: ReadonlySet<string>,
  terminator: string,
): string {
  const pending = new Map<string, TranslationEntry>();
  for (const [key, entry] of entries) {
    if (!emitted.has(key)) {
      pending.set(key, entry);
    }
  }
  return appendGroups(text, groupEntries(pending).values(), terminator);
}

function rewriteDocument(doc: PoDocument, entries: ReadonlyMap<string, TranslationEntry>): string {
  const emitted = new Set<string>();
  const parts: string[] = [];
  for (const node of doc.nodes) {
    if (node.kind === "raw") {
      parts.push(node.text);
      continue;
    }
    if (node.pluralValues !== undefined) {
      const survivors = [...node.pluralValues.keys()]
        .map((index) => ({ index, key: composeKey(node.msgctxt, node.msgid, index) }))
        .map(({ index, key }) => ({ index, key, entry: entries.get(key) }))
        .filter(
          (candidate): candidate is { index: number; key: string; entry: TranslationEntry } =>
            candidate.entry !== undefined,
        )
        .sort((a, b) => a.index - b.index);
      if (survivors.length === 0) {
        continue;
      }
      parts.push(node.prefixRaw);
      for (const { index, key, entry } of survivors) {
        parts.push(renderMsgstrLine(index, entry.value, doc.terminator));
        emitted.add(key);
      }
      continue;
    }
    const key = composeKey(node.msgctxt, node.msgid);
    const entry = entries.get(key);
    if (entry === undefined) {
      continue;
    }
    parts.push(node.prefixRaw);
    parts.push(renderMsgstrLine(undefined, entry.value, doc.terminator));
    emitted.add(key);
  }
  return appendNewEntries(parts.join(""), entries, emitted, doc.terminator);
}

function poLanguage(locale: string): string {
  return posixSpelling(locale, "gettext").spelling ?? locale.replaceAll("-", "_");
}

function synthesizeFromScratch(
  entries: ReadonlyMap<string, TranslationEntry>,
  locale: string,
): string {
  const terminator = "\n";
  const groups = groupEntries(entries);
  let maxIndex = -1;
  for (const group of groups.values()) {
    for (const index of group.values.keys()) {
      if (index !== undefined && index > maxIndex) {
        maxIndex = index;
      }
    }
  }
  const headerLines = [
    'msgid ""',
    'msgstr ""',
    `"Language: ${encodeCString(poLanguage(locale))}\\n"`,
    '"Content-Type: text/plain; charset=UTF-8\\n"',
    '"Content-Transfer-Encoding: 8bit\\n"',
  ];
  if (maxIndex >= 0) {
    headerLines.push(`"Plural-Forms: ${defaultPluralFormsExpression(maxIndex + 1)}\\n"`);
  }
  const header = `${joinSelfTerminated(headerLines, terminator)}${terminator}`;
  return appendGroups(header, groups.values(), terminator);
}

async function readDestination(filePath: string, fs: AdapterFs): Promise<PoDocument | undefined> {
  let outcome: BoundedReadOutcome;
  try {
    outcome = await readBoundedFile(fs, filePath);
  } catch (error) {
    if (isEnoent(error)) {
      return undefined;
    }
    throw new AdapterError("INVALID_STRUCTURE", "The destination file could not be read.");
  }
  const content = outcomeToContent(outcome, "The destination path is not a regular file.");
  return scanPo(content);
}

export async function serializePoEntries(
  entries: ReadonlyMap<string, TranslationEntry>,
  filePath: string,
  fs: AdapterFs,
  _context: WriteContext,
  locale: string,
): Promise<string> {
  const doc = await readDestination(filePath, fs);
  return doc === undefined ? synthesizeFromScratch(entries, locale) : rewriteDocument(doc, entries);
}
