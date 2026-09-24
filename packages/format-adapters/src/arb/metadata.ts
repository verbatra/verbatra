import type { TranslationEntry } from "@verbatra/core";
import { AdapterError } from "../errors.js";
import type { AdapterFs } from "../fs-port.js";
import { readFileContent } from "../json/bounded-read.js";
import { decodeKeyToSegments, encodeSegment } from "../json/key-encoding.js";
import { type OrderedRecord, type OrderedValue, parseOrderedJson } from "../json/ordered-json.js";
import { isEnoent } from "../shell.js";

function isMetadataKey(key: string): boolean {
  return key.startsWith("@");
}

export function parseArbObject(content: string): OrderedRecord {
  const parsed = parseOrderedJson(content);
  if (!(parsed instanceof Map)) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      "The file is not a valid object (expected nested objects of string values).",
    );
  }
  return parsed;
}

export function stripArbMetadata(tree: OrderedRecord): OrderedRecord {
  const out = new Map<string, OrderedValue>();
  for (const [key, value] of tree) {
    if (!isMetadataKey(key)) {
      out.set(key, value);
    }
  }
  return out;
}

function originalKey(encoded: string): string {
  return decodeKeyToSegments(encoded).join(".");
}

function messageKeyForMetadata(key: string): string | null {
  return isMetadataKey(key) && !key.startsWith("@@") ? key.slice(1) : null;
}

function descriptionOf(value: OrderedValue): string | undefined {
  if (!(value instanceof Map)) {
    return undefined;
  }
  const description = value.get("description");
  return typeof description === "string" ? description : undefined;
}

export function extractArbDescriptions(content: string): ReadonlyMap<string, string> {
  const tree = parseArbObject(content);
  const out = new Map<string, string>();
  for (const [key, value] of tree) {
    const messageKey = messageKeyForMetadata(key);
    if (messageKey === null) {
      continue;
    }
    const description = descriptionOf(value);
    if (description !== undefined) {
      out.set(encodeSegment(messageKey), description);
    }
  }
  return out;
}

function messagesFromEntries(entries: ReadonlyMap<string, TranslationEntry>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, entry] of entries) {
    out.set(originalKey(key), entry.value);
  }
  return out;
}

async function readDestinationPairs(
  filePath: string,
  fs: AdapterFs,
): Promise<Array<[string, OrderedValue]> | null> {
  let content: string;
  try {
    content = await readFileContent(fs, filePath);
  } catch (error) {
    if (isEnoent(error)) {
      return null;
    }
    throw error;
  }
  return [...parseArbObject(content)];
}

function isGlobalMetadataKey(key: string): boolean {
  return key.startsWith("@@");
}

function belongsToWrite(key: string, messages: ReadonlyMap<string, string>): boolean {
  if (isGlobalMetadataKey(key)) {
    return true;
  }
  const messageKey = messageKeyForMetadata(key);
  return messageKey !== null && messages.has(messageKey);
}

const LOCALE_KEY = "@@locale";

function flutterLocale(locale: string): string {
  return locale.replaceAll("-", "_");
}

function localeFirst(
  tree: Map<string, OrderedValue>,
  pairs: ReadonlyArray<[string, OrderedValue]> | null,
  locale: string,
): OrderedRecord {
  const existing = tree.get(LOCALE_KEY);
  if (existing === undefined && pairs !== null) {
    return tree;
  }
  tree.delete(LOCALE_KEY);
  return new Map([[LOCALE_KEY, existing ?? flutterLocale(locale)], ...tree]);
}

export async function buildArbWriteTree(
  entries: ReadonlyMap<string, TranslationEntry>,
  filePath: string,
  fs: AdapterFs,
  locale: string,
): Promise<OrderedRecord> {
  const messages = messagesFromEntries(entries);
  const pairs = await readDestinationPairs(filePath, fs);
  const out = new Map<string, OrderedValue>();
  for (const [key, value] of pairs ?? []) {
    if (isMetadataKey(key)) {
      if (belongsToWrite(key, messages)) {
        out.set(key, value);
      }
      continue;
    }
    const translated = messages.get(key);
    if (translated !== undefined) {
      out.set(key, translated);
    }
  }
  for (const [key, value] of messages) {
    if (!out.has(key)) {
      out.set(key, value);
    }
  }
  return localeFirst(out, pairs, locale);
}
