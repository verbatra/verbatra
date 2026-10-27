import { isPlaceholderArgumentName } from "@verbatra/core";

const SUBMESSAGE_TYPES = new Set(["plural", "select", "selectordinal", "choice"]);

interface ParsedArgument {
  readonly name: string;
  readonly type: string | null;
  readonly styleStart: number;
}

function matchingBraces(value: string): Int32Array {
  const close = new Int32Array(value.length).fill(-1);
  const open: number[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char === "{") {
      open.push(i);
    } else if (char === "}") {
      const start = open.pop();
      if (start !== undefined) {
        close[start] = i;
      }
    }
  }
  return close;
}

function findNameEnd(
  value: string,
  from: number,
  limit: number,
): { readonly comma: number; readonly hasBrace: boolean } {
  for (let i = from; i < limit; i += 1) {
    const char = value[i];
    if (char === ",") {
      return { comma: i, hasBrace: false };
    }
    if (char === "{" || char === "}") {
      return { comma: -1, hasBrace: true };
    }
  }
  return { comma: -1, hasBrace: false };
}

function parseArgumentAt(value: string, open: number, close: number): ParsedArgument | null {
  const { comma, hasBrace } = findNameEnd(value, open + 1, close);
  if (hasBrace) {
    return null;
  }
  const nameEnd = comma === -1 ? close : comma;
  const name = value.slice(open + 1, nameEnd).trim();
  if (!isPlaceholderArgumentName(name)) {
    return null;
  }
  if (comma === -1) {
    return { name, type: null, styleStart: -1 };
  }
  const secondComma = value.indexOf(",", comma + 1);
  if (secondComma === -1 || secondComma >= close) {
    return { name, type: value.slice(comma + 1, close).trim(), styleStart: -1 };
  }
  return { name, type: value.slice(comma + 1, secondComma).trim(), styleStart: secondComma + 1 };
}

function canonicalToken(value: string, arg: ParsedArgument, close: number): string {
  if (arg.type === null) {
    return `{${arg.name}}`;
  }
  if (arg.styleStart === -1) {
    return `{${arg.name},${arg.type}}`;
  }
  return `{${arg.name},${arg.type},${value.slice(arg.styleStart, close).trim()}}`;
}

function emitArgument(
  value: string,
  close: Int32Array,
  arg: ParsedArgument,
  closeIndex: number,
  out: string[],
): void {
  if (arg.type !== null && SUBMESSAGE_TYPES.has(arg.type)) {
    out.push(`{${arg.name},${arg.type}}`);
    if (arg.styleStart !== -1) {
      scanRange(value, close, arg.styleStart, closeIndex, false, out);
    }
    return;
  }
  out.push(canonicalToken(value, arg, closeIndex));
}

function scanRange(
  value: string,
  close: Int32Array,
  start: number,
  end: number,
  topLevel: boolean,
  out: string[],
): void {
  let i = start;
  while (i < end) {
    if (value[i] !== "{") {
      i += 1;
      continue;
    }
    if (topLevel && value[i + 1] === "{") {
      i += 2;
      continue;
    }
    const closeIndex = close[i] ?? -1;
    if (closeIndex === -1 || closeIndex >= end) {
      i += 1;
      continue;
    }
    const arg = parseArgumentAt(value, i, closeIndex);
    if (arg === null) {
      i += 1;
      continue;
    }
    emitArgument(value, close, arg, closeIndex, out);
    i = closeIndex + 1;
  }
}

export function extractPropertiesPlaceholders(value: string): readonly string[] {
  const out: string[] = [];
  scanRange(value, matchingBraces(value), 0, value.length, true, out);
  return out;
}
