const XLIFF_INLINE_NAMES = new Set([
  "x",
  "g",
  "bx",
  "ex",
  "bpt",
  "ept",
  "ph",
  "it",
  "mrk",
  "pc",
  "sc",
  "ec",
  "sm",
  "em",
  "cp",
]);

const LESS_THAN = 0x3c;
const GREATER_THAN = 0x3e;
const OPEN_BRACE = 0x7b;
const CLOSE_BRACE = 0x7d;

interface Scan {
  readonly token?: string;
  readonly next: number;
}

function isWordCode(code: number): boolean {
  return (
    (code >= 0x30 && code <= 0x39) ||
    (code >= 0x41 && code <= 0x5a) ||
    (code >= 0x61 && code <= 0x7a) ||
    code === 0x5f
  );
}

function scanUntil(value: string, from: number, close: number, abort: number): number {
  let i = from;
  while (i < value.length) {
    const code = value.charCodeAt(i);
    if (code === close || code === abort) {
      return i;
    }
    i += 1;
  }
  return i;
}

function scanTag(value: string, start: number): Scan {
  let nameEnd = start + 1;
  while (nameEnd < value.length && isWordCode(value.charCodeAt(nameEnd))) {
    nameEnd += 1;
  }
  if (!XLIFF_INLINE_NAMES.has(value.slice(start + 1, nameEnd))) {
    return { next: start + 1 };
  }
  const stop = scanUntil(value, nameEnd, GREATER_THAN, LESS_THAN);
  if (stop < value.length && value.charCodeAt(stop) === GREATER_THAN) {
    return { token: value.slice(start, stop + 1), next: stop + 1 };
  }
  return { next: start + 1 };
}

function scanBraces(value: string, start: number): Scan {
  const stop = scanUntil(value, start + 1, CLOSE_BRACE, OPEN_BRACE);
  if (stop > start + 1 && stop < value.length && value.charCodeAt(stop) === CLOSE_BRACE) {
    return { token: value.slice(start, stop + 1), next: stop + 1 };
  }
  return { next: start + 1 };
}

export function extractXliffPlaceholders(value: string): readonly string[] {
  const tokens: string[] = [];
  let i = 0;
  while (i < value.length) {
    const code = value.charCodeAt(i);
    if (code !== LESS_THAN && code !== OPEN_BRACE) {
      i += 1;
      continue;
    }
    const scan = code === LESS_THAN ? scanTag(value, i) : scanBraces(value, i);
    if (scan.token !== undefined) {
      tokens.push(scan.token);
    }
    i = scan.next;
  }
  return tokens;
}
