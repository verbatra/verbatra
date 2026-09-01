import { AdapterError } from "../errors.js";

const UNICODE_ESCAPE = /^[0-9a-fA-F]{4}$/;

function decodeUnicodeEscape(raw: string, at: number): string {
  const hex = raw.slice(at, at + 4);
  if (!UNICODE_ESCAPE.test(hex)) {
    throw new AdapterError("INVALID_STRUCTURE", "The file has a malformed \\u unicode escape.");
  }
  return String.fromCharCode(Number.parseInt(hex, 16));
}

function decodeSimpleEscape(char: string): string {
  switch (char) {
    case "n":
      return "\n";
    case "t":
      return "\t";
    case "'":
      return "'";
    case '"':
      return '"';
    case "\\":
      return "\\";
    case "@":
      return "@";
    case "?":
      return "?";
    default:
      return char;
  }
}

export function decodeAndroidEscapes(raw: string): string {
  const pieces: string[] = [];
  let i = 0;
  while (i < raw.length) {
    const char = raw[i];
    if (char !== "\\") {
      pieces.push(char ?? "");
      i += 1;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) {
      i += 1;
      continue;
    }
    if (next === "u") {
      pieces.push(decodeUnicodeEscape(raw, i + 2));
      i += 6;
      continue;
    }
    pieces.push(decodeSimpleEscape(next));
    i += 2;
  }
  return pieces.join("");
}

function escapeChar(char: string, isFirst: boolean): string {
  switch (char) {
    case "\\":
      return "\\\\";
    case "'":
      return "\\'";
    case '"':
      return '\\"';
    case "\n":
      return "\\n";
    case "\t":
      return "\\t";
    case "@":
      return isFirst ? "\\@" : "@";
    case "?":
      return isFirst ? "\\?" : "?";
    default:
      return char;
  }
}

export function encodeAndroidEscapes(value: string): string {
  const pieces: string[] = [];
  for (let i = 0; i < value.length; i += 1) {
    const char = value[i];
    if (char !== undefined) {
      pieces.push(escapeChar(char, i === 0));
    }
  }
  return pieces.join("");
}
