import type { TextSpan } from "./detectors.js";

const TOKEN_PREFIX = "__VBR";
const ANY_TOKEN = /__VBR\d+__/g;

export function redactionToken(index: number): string {
  return `${TOKEN_PREFIX}${index}__`;
}

export function replaceSpans(
  text: string,
  spans: readonly TextSpan[],
  replacement: (index: number) => string,
): string {
  let out = "";
  let cursor = 0;
  for (const [index, span] of spans.entries()) {
    out += text.slice(cursor, span.start) + replacement(index);
    cursor = span.end;
  }
  return out + text.slice(cursor);
}

function placeholderRanges(value: string, placeholders: readonly string[]): TextSpan[] {
  const ranges: TextSpan[] = [];
  for (const placeholder of new Set(placeholders)) {
    if (placeholder.length === 0) {
      continue;
    }
    let at = value.indexOf(placeholder);
    while (at !== -1) {
      ranges.push({ start: at, end: at + placeholder.length });
      at = value.indexOf(placeholder, at + placeholder.length);
    }
  }
  return ranges;
}

function overlaps(span: TextSpan, ranges: readonly TextSpan[]): boolean {
  return ranges.some((range) => span.start < range.end && range.start < span.end);
}

export interface RedactedValue {
  readonly text: string;
  readonly tokens: readonly string[];
  readonly originals: readonly string[];
}

export function redactValue(
  value: string,
  spans: readonly TextSpan[],
  placeholders: readonly string[],
): RedactedValue | undefined {
  if (value.includes(TOKEN_PREFIX)) {
    return undefined;
  }
  const ranges = placeholderRanges(value, placeholders);
  if (spans.some((span) => overlaps(span, ranges))) {
    return undefined;
  }
  return {
    text: replaceSpans(value, spans, redactionToken),
    tokens: spans.map((_span, index) => redactionToken(index)),
    originals: spans.map((span) => value.slice(span.start, span.end)),
  };
}

function occurrences(text: string, token: string): number {
  return text.split(token).length - 1;
}

export function restoreTokens(text: string, originals: readonly string[]): string | undefined {
  if ((text.match(ANY_TOKEN) ?? []).length !== originals.length) {
    return undefined;
  }
  let restored = text;
  for (const [index, original] of originals.entries()) {
    const token = redactionToken(index);
    if (occurrences(text, token) !== 1) {
      return undefined;
    }
    restored = restored.split(token).join(original);
  }
  return restored;
}
