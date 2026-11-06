import type {
  IcuPreviewFailure,
  IcuPreviewResult,
  IcuPreviewRow,
  MessageArguments,
  MessageArgumentType,
} from "@verbatra/sdk";
import {
  ICU_PREVIEW_ARG_TEXT_MAX_LENGTH,
  ICU_PREVIEW_ARGS_MAX_ENTRIES,
} from "../shared/rpc/key-preview-icu.js";

export const ICU_PREVIEW_DELAY_MS = 400;
export const ICU_PREVIEW_FIELD_LIMIT = 24;

export const ICU_FAILURE_COPY: Readonly<Record<IcuPreviewFailure, string>> = {
  "too-long": "This message is over 20,000 characters, too long to preview.",
  "too-complex": "This message nests too deeply or has too many braces and tags to preview.",
  "invalid-message": "This is not valid ICU message syntax.",
  "unsupported-locale": "This computer's language data does not know this locale.",
  "too-large": "The rendered message would be too large to show.",
};

export type SupportedIcuPreview = Extract<IcuPreviewResult, { readonly supported: true }>;

export type ValidIcuPreview = Extract<SupportedIcuPreview, { readonly valid: true }>;

export interface SampleField {
  readonly name: string;
  readonly type: MessageArgumentType;
}

export function sampleFields(described: MessageArguments): readonly SampleField[] {
  if (described.style === "positional") {
    return described.positional.map((type, index) => ({ name: String(index), type }));
  }
  return described.style === "named"
    ? described.named.map((argument) => ({ name: argument.name, type: argument.type }))
    : [];
}

export type SampleProblem = "number" | "date" | "range" | "long";

export const SAMPLE_PROBLEM_COPY: Readonly<Record<SampleProblem, string>> = {
  number:
    "Not a number, or a comma before exactly three digits, which could mean thousands. The default is used.",
  date: "Not a date as 2024-03-15 or a number of milliseconds since 1970-01-01 UTC. The default is used.",
  range: "Outside the dates a computer can show. The default is used.",
  long: `Over ${ICU_PREVIEW_ARG_TEXT_MAX_LENGTH} characters. The default is used.`,
};

export interface PreparedSamples {
  readonly args: Readonly<Record<string, string | number>> | undefined;
  readonly problems: ReadonlyMap<string, SampleProblem>;
}

const DECIMAL = /^-?\d+(\.\d+)?$/;
const DECIMAL_COMMA = /^-?\d+([.,]\d+)?$/;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const MAX_DATE_MS = 8.64e15;

const DIGIT_BLOCKS: readonly (readonly [number, number])[] = [
  [0x0660, 0x0669],
  [0x06f0, 0x06f9],
];

function asciiDigits(text: string): string {
  return text.replace(/\u066b/g, ".").replace(/[\u0660-\u0669\u06f0-\u06f9]/g, (digit) => {
    const code = digit.charCodeAt(0);
    const block = DIGIT_BLOCKS.find(([start, end]) => code >= start && code <= end);
    return String(code - (block?.[0] ?? code));
  });
}

function decimalOf(raw: string, allowComma: boolean): number | undefined {
  const text = asciiDigits(raw);
  if (!(allowComma ? DECIMAL_COMMA : DECIMAL).test(text) || /,\d{3}$/.test(text)) {
    return undefined;
  }
  const parsed = Number(text.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function isoDateOf(text: string): number | undefined {
  const match = ISO_DATE.exec(text);
  if (match === null) {
    return undefined;
  }
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const milliseconds = Date.UTC(year, month - 1, day);
  const back = new Date(milliseconds);
  const same =
    back.getUTCFullYear() === year && back.getUTCMonth() === month - 1 && back.getUTCDate() === day;
  return same ? milliseconds : undefined;
}

type Coerced =
  | { readonly kind: "value"; readonly value: string | number }
  | { readonly kind: "problem"; readonly problem: SampleProblem };

function inDateRange(value: number): boolean {
  return Math.abs(value) <= MAX_DATE_MS;
}

function coerceDate(text: string): Coerced {
  const value = isoDateOf(text) ?? decimalOf(text, false);
  if (value === undefined) {
    return { kind: "problem", problem: "date" };
  }
  return inDateRange(value) ? { kind: "value", value } : { kind: "problem", problem: "range" };
}

function coerceLoose(text: string, type: MessageArgumentType): Coerced {
  if (text.length > ICU_PREVIEW_ARG_TEXT_MAX_LENGTH) {
    return { kind: "problem", problem: "long" };
  }
  if (type === "date-or-string") {
    const date = isoDateOf(text) ?? decimalOf(text, false);
    if (date !== undefined) {
      return inDateRange(date)
        ? { kind: "value", value: date }
        : { kind: "problem", problem: "range" };
    }
  }
  const number = type === "unknown" ? decimalOf(text, false) : undefined;
  return { kind: "value", value: number ?? text };
}

function coerce(text: string, type: MessageArgumentType): Coerced {
  if (type === "number") {
    const number = decimalOf(text, true);
    return number === undefined
      ? { kind: "problem", problem: "number" }
      : { kind: "value", value: number };
  }
  return type === "date" ? coerceDate(text) : coerceLoose(text, type);
}

export function prepareSamples(
  fields: readonly SampleField[],
  inputs: ReadonlyMap<string, string>,
): PreparedSamples {
  const args: Record<string, string | number> = Object.create(null) as Record<
    string,
    string | number
  >;
  const problems = new Map<string, SampleProblem>();
  let given = 0;
  for (const field of fields.slice(0, ICU_PREVIEW_FIELD_LIMIT)) {
    const text = (inputs.get(field.name) ?? "").trim();
    if (text === "" || given >= ICU_PREVIEW_ARGS_MAX_ENTRIES) {
      continue;
    }
    const coerced = coerce(text, field.type);
    if (coerced.kind === "problem") {
      problems.set(field.name, coerced.problem);
    } else {
      args[field.name] = coerced.value;
      given += 1;
    }
  }
  return { args: given === 0 ? undefined : args, problems };
}

export function samplesKey(samples: PreparedSamples): string {
  const entries = Object.entries(samples.args ?? {});
  return JSON.stringify(entries);
}

export interface RowGroup {
  readonly held: readonly (readonly [string, string | number])[];
  readonly supplied: boolean;
  readonly rows: readonly IcuPreviewRow[];
}

export function groupRows(rows: readonly IcuPreviewRow[]): readonly RowGroup[] {
  const typed = rows.filter((row) => row.supplied);
  const groups = new Map<
    string,
    { held: RowGroup["held"]; supplied: boolean; rows: IcuPreviewRow[] }
  >();
  for (const row of rows.filter((candidate) => !candidate.supplied)) {
    const held = Object.entries(row.held);
    const key = JSON.stringify(held);
    const group = groups.get(key) ?? { held, supplied: false, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  }
  const lead = typed.length > 0 ? [{ held: [], supplied: true, rows: typed }] : [];
  return [...lead, ...groups.values()];
}

export const SAMPLE_UNUSED_COPY = "Not used by this text.";

function textUsedBy(rows: readonly IcuPreviewRow[], value: string | number): boolean {
  const needle = String(value);
  return rows.some((row) =>
    row.segments.some((segment) => segment.kind === "argument" && segment.text.includes(needle)),
  );
}

export function unusedSamples(
  fields: readonly SampleField[],
  args: PreparedSamples["args"],
  rows: readonly IcuPreviewRow[],
): ReadonlySet<string> {
  const unused = new Set<string>();
  for (const field of fields) {
    const typed =
      args !== undefined && Object.hasOwn(args, field.name) ? args[field.name] : undefined;
    if (typed === undefined) {
      continue;
    }
    if (rows.some((row) => row.argument === field.name)) {
      if (!rows.some((row) => row.supplied && row.argument === field.name)) {
        unused.add(field.name);
      }
    } else if ((field.type === "string" || field.type === "unknown") && !textUsedBy(rows, typed)) {
      unused.add(field.name);
    }
  }
  return unused;
}

export function isBlankPreview(rows: readonly IcuPreviewRow[]): boolean {
  const only = rows.length === 1 ? rows[0] : undefined;
  return only !== undefined && only.axis === "none" && only.segments.every((s) => s.text === "");
}
