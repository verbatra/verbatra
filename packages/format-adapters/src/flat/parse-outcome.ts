import type { FormatId, TranslationEntry } from "@verbatra/core";
import { AdapterError } from "../errors.js";

interface FieldRule {
  readonly field: string;
  readonly accepts: (value: unknown) => boolean;
  readonly expected: string;
}

const isString = (value: unknown): boolean => typeof value === "string";
const isOptionalString = (value: unknown): boolean => value === undefined || isString(value);
const isStringArray = (value: unknown): boolean => Array.isArray(value) && value.every(isString);

const FIELD_RULES: readonly FieldRule[] = [
  { field: "namespace", accepts: isString, expected: "a string" },
  { field: "value", accepts: isString, expected: "a string" },
  { field: "placeholders", accepts: isStringArray, expected: "an array of strings" },
  { field: "isPlural", accepts: (value) => typeof value === "boolean", expected: "a boolean" },
  { field: "description", accepts: isOptionalString, expected: "a string when present" },
  { field: "meaning", accepts: isOptionalString, expected: "a string when present" },
];

function entryProblem(key: unknown, entry: unknown): string | undefined {
  if (typeof key !== "string" || key.length === 0) {
    return "an entry whose map key is not a non-empty string";
  }
  const label = JSON.stringify(key);
  if (typeof entry !== "object" || entry === null) {
    return `a non-object entry for ${label}`;
  }
  const fields = entry as Readonly<Record<string, unknown>>;
  if (fields.key !== key) {
    return `an entry for ${label} whose key field does not match its map key`;
  }
  const broken = FIELD_RULES.find((rule) => !rule.accepts(fields[rule.field]));
  return broken === undefined
    ? undefined
    : `an entry for ${label} whose ${broken.field} is not ${broken.expected}`;
}

function entriesProblem(entries: unknown): string | undefined {
  if (!(entries instanceof Map)) {
    return "entries that are not a Map";
  }
  for (const [key, entry] of entries) {
    const problem = entryProblem(key, entry);
    if (problem !== undefined) {
      return problem;
    }
  }
  return undefined;
}

function excludedProblem(excluded: unknown): string | undefined {
  return excluded === undefined || isStringArray(excluded)
    ? undefined
    : "excludedLeafPaths that are not an array of strings";
}

export interface ParsedEntries {
  readonly entries: Map<string, TranslationEntry>;
  readonly excludedLeafPaths: readonly string[];
}

export function checkedParseOutcome(format: FormatId, outcome: unknown): ParsedEntries {
  const isMap = outcome instanceof Map;
  const result = (isMap ? { entries: outcome } : outcome) as
    | { readonly entries?: unknown; readonly excludedLeafPaths?: unknown }
    | null
    | undefined;
  const problem =
    typeof result !== "object" || result === null
      ? "neither a Map nor an object with an entries Map"
      : (entriesProblem(result.entries) ?? excludedProblem(result.excludedLeafPaths));
  if (problem !== undefined) {
    throw new AdapterError(
      "ADAPTER_FAILED",
      `The "${format}" adapter's parseEntries() returned ${problem}, so the file was not read.`,
    );
  }
  const checked = result as {
    readonly entries: Map<string, TranslationEntry>;
    readonly excludedLeafPaths?: readonly string[];
  };
  return { entries: checked.entries, excludedLeafPaths: checked.excludedLeafPaths ?? [] };
}
