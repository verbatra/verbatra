import { basename, dirname, extname, join } from "node:path";
import type { TranslationEntry } from "@verbatra/core";
import type { FormatAdapter } from "../adapter.js";
import { AdapterError } from "../errors.js";
import { createFlatFileAdapter } from "../flat/flat-file-adapter.js";
import { type AdapterFs, nodeAdapterFs } from "../fs-port.js";
import { readFileContent } from "../json/bounded-read.js";
import { isEnoent } from "../shell.js";
import { parseAppleStringsEntries, serializeAppleStringsEntries } from "./parse.js";
import { extractAppleStringsPlaceholders } from "./placeholders.js";
import {
  parseAppleStringsDictEntries,
  serializeAppleStringsDictEntries,
} from "./stringsdict-parse.js";

function stringsDictSiblingPath(filePath: string): string {
  return join(dirname(filePath), `${basename(filePath, extname(filePath))}.stringsdict`);
}

function partitionEntries(entries: ReadonlyMap<string, TranslationEntry>): {
  readonly singular: Map<string, TranslationEntry>;
  readonly plural: Map<string, TranslationEntry>;
} {
  const singular = new Map<string, TranslationEntry>();
  const plural = new Map<string, TranslationEntry>();
  for (const [key, entry] of entries) {
    (entry.isPlural ? plural : singular).set(key, entry);
  }
  return { singular, plural };
}

async function parseAppleEntries(
  content: string,
  namespace: string,
  filePath: string,
  fs: AdapterFs,
): Promise<Map<string, TranslationEntry>> {
  const singular = parseAppleStringsEntries(content, namespace);
  const siblingPath = stringsDictSiblingPath(filePath);
  let siblingContent: string;
  try {
    siblingContent = await readFileContent(fs, siblingPath);
  } catch (error) {
    if (isEnoent(error)) {
      return singular;
    }
    throw error;
  }
  const plural = parseAppleStringsDictEntries(siblingContent, namespace, siblingPath);
  const merged = new Map(singular);
  for (const [key, entry] of plural) {
    if (merged.has(key)) {
      throw new AdapterError(
        "INVALID_STRUCTURE",
        `The key "${key}" is defined both in ${filePath} and as a plural category in ${siblingPath}. ` +
          "Rename one of them to avoid ambiguity.",
      );
    }
    merged.set(key, entry);
  }
  return merged;
}

async function serializeAppleEntries(
  entries: ReadonlyMap<string, TranslationEntry>,
  filePath: string,
  fs: AdapterFs,
): Promise<string> {
  const { singular, plural } = partitionEntries(entries);
  const siblingPath = stringsDictSiblingPath(filePath);
  const xml = await serializeAppleStringsDictEntries(plural, siblingPath, fs);
  if (xml !== undefined) {
    await fs.writeFileAtomic(siblingPath, xml);
  }
  return serializeAppleStringsEntries(singular, filePath, fs);
}

export function createAppleStringsAdapter(fs: AdapterFs = nodeAdapterFs): FormatAdapter {
  return createFlatFileAdapter({
    fs,
    format: "apple-strings",
    extensions: [".strings"],
    parseEntries: parseAppleEntries,
    serializeEntries: serializeAppleEntries,
    extractPlaceholders: extractAppleStringsPlaceholders,
  });
}
