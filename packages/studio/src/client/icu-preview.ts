import type {
  IcuPreviewFailure,
  IcuPreviewResult,
  MessageArguments,
  MessageArgumentType,
} from "@verbatra/sdk";
import {
  ICU_PREVIEW_ARG_TEXT_MAX_LENGTH,
  ICU_PREVIEW_ARGS_MAX_ENTRIES,
} from "../shared/rpc/key-preview-icu.js";

export const ICU_PREVIEW_DELAY_MS = 400;
export const ICU_PREVIEW_FIELD_LIMIT = 24;

const ICU_FORMATS: ReadonlySet<string> = new Set(["next-intl-json", "arb"]);

export function formatUsesIcu(format: string): boolean {
  return ICU_FORMATS.has(format);
}

export const ICU_FAILURE_COPY: Readonly<Record<IcuPreviewFailure, string>> = {
  "too-long": "This message is over 20,000 characters, too long to preview.",
  "too-complex": "This message nests too deeply or has too many braces and tags to preview.",
  "invalid-message": "This is not valid ICU message syntax, so there is nothing to preview.",
  "unsupported-locale":
    "This machine's locale data does not know this locale, so it cannot be previewed.",
  "too-large": "The rendered message would be too large to show.",
};

export type SupportedIcuPreview = Extract<IcuPreviewResult, { readonly supported: true }>;

export type ValidIcuPreview = Extract<SupportedIcuPreview, { readonly valid: true }>;

export interface SampleField {
  readonly name: string;
  readonly type: MessageArgumentType;
}

export function sampleFields(described: MessageArguments): readonly SampleField[] {
  return described.style === "named"
    ? described.named.map((argument) => ({ name: argument.name, type: argument.type }))
    : [];
}

export type SampleProblem = "number" | "date" | "long";

export const SAMPLE_PROBLEM_COPY: Readonly<Record<SampleProblem, string>> = {
  number: "Not a number. The default is used.",
  date: "Not a number of milliseconds since 1970-01-01 UTC. The default is used.",
  long: `Over ${ICU_PREVIEW_ARG_TEXT_MAX_LENGTH} characters. The default is used.`,
};

export interface PreparedSamples {
  readonly args: Readonly<Record<string, string | number>> | undefined;
  readonly problems: ReadonlyMap<string, SampleProblem>;
}

const DECIMAL = /^-?\d+(\.\d+)?$/;

function decimalOf(text: string): number | undefined {
  if (!DECIMAL.test(text)) {
    return undefined;
  }
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}

type Coerced =
  | { readonly kind: "value"; readonly value: string | number }
  | { readonly kind: "problem"; readonly problem: SampleProblem };

function coerce(text: string, type: MessageArgumentType): Coerced {
  const number = decimalOf(text);
  if (type === "number") {
    return number === undefined
      ? { kind: "problem", problem: "number" }
      : { kind: "value", value: number };
  }
  if (type === "date") {
    return number === undefined
      ? { kind: "problem", problem: "date" }
      : { kind: "value", value: number };
  }
  if (text.length > ICU_PREVIEW_ARG_TEXT_MAX_LENGTH) {
    return { kind: "problem", problem: "long" };
  }
  const numeric = type === "unknown" || type === "date-or-string";
  return { kind: "value", value: numeric && number !== undefined ? number : text };
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
