import { foreignPlaceholderTokens } from "@verbatra/core";

/** How a {@link KeyHistorySegment} relates the older text to the newer one. */
export type KeyHistorySegmentKind = "equal" | "added" | "removed";

/** One run of text in a word-level difference between two values. */
export interface KeyHistorySegment {
  /** `equal` text is in both values, `removed` only in the older one, `added` only in the newer one. */
  readonly kind: KeyHistorySegmentKind;
  /** The text of the run. It is the value's own text and untrusted: show it as text, never as markup. */
  readonly text: string;
}

export const VALUE_DIFF_MAX_CELLS = 250_000;
export const VALUE_DIFF_MAX_CHARS = 16_384;

const MAX_WHOLE_PLACEHOLDER_CHARS = 64;
const MAX_NESTING = 3;
const TAG = /<\/?[A-Za-z0-9][^<>\n]{0,100}>/y;
const WORD = /[\p{L}\p{N}\p{M}_]+/uy;
const SPACE = /\s+/y;

function matchAt(pattern: RegExp, text: string, index: number): string | undefined {
  pattern.lastIndex = index;
  return pattern.exec(text)?.[0];
}

function tokenAt(text: string, index: number): string {
  return (
    (text.charAt(index) === "<" ? matchAt(TAG, text, index) : undefined) ??
    matchAt(WORD, text, index) ??
    matchAt(SPACE, text, index) ??
    String.fromCodePoint(text.codePointAt(index) as number)
  );
}

function plainTokens(text: string): string[] {
  const tokens: string[] = [];
  let index = 0;
  while (index < text.length) {
    const token = tokenAt(text, index);
    tokens.push(token);
    index += token.length;
  }
  return tokens;
}

function append(target: string[], more: readonly string[]): void {
  for (const token of more) {
    target.push(token);
  }
}

function tokenizeAt(text: string, depth: number): string[] {
  const tokens: string[] = [];
  let cursor = 0;
  const placeholders = foreignPlaceholderTokens(text, []);
  const gapTokens = (gap: string): string[] =>
    placeholders.length > 0 && depth < MAX_NESTING ? tokenizeAt(gap, depth + 1) : plainTokens(gap);
  for (const placeholder of placeholders) {
    const start = text.indexOf(placeholder, cursor);
    /* v8 ignore next 3 -- a token found in the scanned text, where only whole URL runs are blanked, occurs in the original at or after the cursor. */
    if (start === -1) {
      continue;
    }
    append(tokens, gapTokens(text.slice(cursor, start)));
    if (placeholder.length > MAX_WHOLE_PLACEHOLDER_CHARS && depth < MAX_NESTING) {
      tokens.push(placeholder.charAt(0));
      append(tokens, tokenizeAt(placeholder.slice(1), depth + 1));
    } else {
      tokens.push(placeholder);
    }
    cursor = start + placeholder.length;
  }
  append(tokens, gapTokens(text.slice(cursor)));
  return tokens;
}

export function tokenizeValue(text: string): string[] {
  return tokenizeAt(text, 0);
}

function commonPrefix(a: readonly string[], b: readonly string[]): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) {
    length += 1;
  }
  return length;
}

function commonSuffix(a: readonly string[], b: readonly string[], prefix: number): number {
  let length = 0;
  while (
    length < a.length - prefix &&
    length < b.length - prefix &&
    a[a.length - 1 - length] === b[b.length - 1 - length]
  ) {
    length += 1;
  }
  return length;
}

function pushSegment(
  segments: KeyHistorySegment[],
  kind: KeyHistorySegmentKind,
  text: string,
): void {
  if (text.length === 0) {
    return;
  }
  const last = segments[segments.length - 1];
  if (last?.kind === kind) {
    segments[segments.length - 1] = { kind, text: last.text + text };
  } else {
    segments.push({ kind, text });
  }
}

function lcsTable(a: readonly string[], b: readonly string[]): Uint16Array {
  const width = b.length + 1;
  const table = new Uint16Array((a.length + 1) * width);
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      table[i * width + j] =
        a[i] === b[j]
          ? (table[(i + 1) * width + j + 1] as number) + 1
          : Math.max(table[(i + 1) * width + j] as number, table[i * width + j + 1] as number);
    }
  }
  return table;
}

function middleSegments(a: readonly string[], b: readonly string[]): KeyHistorySegment[] {
  const segments: KeyHistorySegment[] = [];
  if ((a.length + 1) * (b.length + 1) > VALUE_DIFF_MAX_CELLS) {
    pushSegment(segments, "removed", a.join(""));
    pushSegment(segments, "added", b.join(""));
    return segments;
  }
  const width = b.length + 1;
  const table = lcsTable(a, b);
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      pushSegment(segments, "equal", a[i] as string);
      i += 1;
      j += 1;
    } else if ((table[(i + 1) * width + j] as number) >= (table[i * width + j + 1] as number)) {
      pushSegment(segments, "removed", a[i] as string);
      i += 1;
    } else {
      pushSegment(segments, "added", b[j] as string);
      j += 1;
    }
  }
  pushSegment(segments, "removed", a.slice(i).join(""));
  pushSegment(segments, "added", b.slice(j).join(""));
  return segments;
}

export function diffValues(older: string, newer: string): KeyHistorySegment[] {
  if (older === newer) {
    const same: KeyHistorySegment[] = [];
    pushSegment(same, "equal", older);
    return same;
  }
  if (older.length > VALUE_DIFF_MAX_CHARS || newer.length > VALUE_DIFF_MAX_CHARS) {
    const replaced: KeyHistorySegment[] = [];
    pushSegment(replaced, "removed", older);
    pushSegment(replaced, "added", newer);
    return replaced;
  }
  const a = tokenizeValue(older);
  const b = tokenizeValue(newer);
  const prefix = commonPrefix(a, b);
  const suffix = commonSuffix(a, b, prefix);
  const segments: KeyHistorySegment[] = [];
  pushSegment(segments, "equal", a.slice(0, prefix).join(""));
  for (const segment of middleSegments(
    a.slice(prefix, a.length - suffix),
    b.slice(prefix, b.length - suffix),
  )) {
    pushSegment(segments, segment.kind, segment.text);
  }
  pushSegment(segments, "equal", a.slice(a.length - suffix).join(""));
  return segments;
}
