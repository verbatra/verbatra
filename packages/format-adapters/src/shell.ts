import { basename, extname } from "node:path";
import type { PlaceholderIntegrityResult, TranslationEntry } from "@verbatra/core";
import { AdapterError } from "./errors.js";
import type { JsonRecord } from "./json/json-tree.js";

/**
 * Finds a format's placeholder tokens in one translatable value, in document order. Resolves
 * nothing and never throws; a value with no placeholders yields an empty list.
 */
export type ExtractPlaceholders = (value: string) => readonly string[];

/**
 * Reports the keys whose values are invalid for a format's message syntax, given every entry read
 * from one file. Only the ICU-message formats need one; a format with no message syntax omits it.
 */
export type ComputeInvalidIcuKeys = (
  entries: ReadonlyMap<string, TranslationEntry>,
) => readonly string[];

/**
 * Decides whether one candidate value is valid for a format's message syntax before it is written.
 * Never throws: an unparseable value returns false.
 */
export type ValidateMessage = (value: string) => boolean;

/**
 * Compares a source value against its translation as whole values rather than as two flat token
 * lists, for a format whose structure (an ICU plural or select branch, for example) would be lost by
 * flattening. Never throws: a mismatch is data.
 */
export type ComparePlaceholders = (
  sourceValue: string,
  targetValue: string,
) => PlaceholderIntegrityResult;

/**
 * Rejects a parsed tree that is structurally wrong for a format, by throwing an `AdapterError`.
 * Returns nothing when the tree is acceptable.
 */
export type ValidateTree = (tree: JsonRecord) => void;

/**
 * Decides whether a leading content sample looks like this format, so two adapters claiming the same
 * file extension can still be told apart. Consulted only when a sample is available.
 */
export type Sniff = (sample: string) => boolean;

export type LineTerminator = "\n" | "\r\n" | "\r";

const LINE_TERMINATOR_SPLIT = /\r\n|\r|\n/;
const TRAILING_LINE_TERMINATOR = /(?:\r\n|\r|\n)$/;

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
  const lines = content.split(LINE_TERMINATOR_SPLIT);
  if (TRAILING_LINE_TERMINATOR.test(content)) {
    lines.pop();
  }
  return lines;
}

export function scanTokens(
  value: string,
  pattern: RegExp,
  extract: (match: RegExpMatchArray) => string | undefined = (match) => match[0],
): readonly string[] {
  const result: string[] = [];
  for (const match of value.matchAll(pattern)) {
    const token = extract(match);
    if (token !== undefined) {
      result.push(token);
    }
  }
  return result;
}

export function namespaceOf(filePath: string): string {
  return basename(filePath, extname(filePath));
}

export function isEnoent(error: unknown): boolean {
  return error instanceof Error && "code" in error && error.code === "ENOENT";
}

export function rethrowStructured(error: unknown, message: string): never {
  if (error instanceof AdapterError) {
    throw error;
  }
  throw new AdapterError("INVALID_STRUCTURE", message);
}

export function computeIcu(
  entries: ReadonlyMap<string, TranslationEntry>,
  compute?: ComputeInvalidIcuKeys,
): readonly string[] {
  if (!compute) {
    return [];
  }
  try {
    return compute(entries);
  } catch (error) {
    rethrowStructured(error, "The file could not be analyzed for message validity.");
  }
}

export function buildCanHandle(
  extensions: readonly string[],
  sniff?: Sniff,
): (filePath: string, sample?: string) => boolean {
  return (filePath, sample): boolean => {
    if (!extensions.includes(extname(filePath).toLowerCase())) {
      return false;
    }
    return sample === undefined || sniff === undefined || sniff(sample);
  };
}
