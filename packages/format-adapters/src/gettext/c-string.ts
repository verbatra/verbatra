import { AdapterError } from "../errors.js";

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  n: "\n",
  t: "\t",
  r: "\r",
  a: "\x07",
  b: "\b",
  f: "\f",
  v: "\v",
  "0": "\0",
  '"': '"',
  "\\": "\\",
};

const OCTAL_DIGIT = /[0-7]/;

function decodeHexEscape(raw: string, at: number, line: number): { char: string; next: number } {
  let hex = "";
  let i = at;
  /* v8 ignore next -- defensive: the "?? \"\"" fallback can only matter when i >= raw.length, but
   * the preceding "i < raw.length" guard in this same condition already excludes that case. */
  while (i < raw.length && hex.length < 2 && /[0-9a-fA-F]/.test(raw[i] ?? "")) {
    hex += raw[i];
    i += 1;
  }
  if (hex === "") {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The .po/.pot file has a malformed \\x escape (line ${line}).`,
    );
  }
  return { char: String.fromCharCode(Number.parseInt(hex, 16)), next: i };
}

function decodeOctalEscape(raw: string, at: number): { char: string; next: number } {
  let octal = "";
  let i = at;
  /* v8 ignore next -- defensive: the "?? \"\"" fallback can only matter when i >= raw.length, but
   * the preceding "i < raw.length" guard in this same condition already excludes that case. */
  while (i < raw.length && octal.length < 3 && OCTAL_DIGIT.test(raw[i] ?? "")) {
    octal += raw[i];
    i += 1;
  }
  return { char: String.fromCharCode(Number.parseInt(octal, 8)), next: i };
}

export function decodeCString(raw: string, line: number): string {
  let out = "";
  let i = 0;
  while (i < raw.length) {
    const char = raw[i];
    if (char !== "\\") {
      out += char;
      i += 1;
      continue;
    }
    const next = raw[i + 1];
    if (next === undefined) {
      throw new AdapterError(
        "INVALID_STRUCTURE",
        `The .po/.pot file has a trailing, unterminated escape (line ${line}).`,
      );
    }
    if (next === "x") {
      const hex = decodeHexEscape(raw, i + 2, line);
      out += hex.char;
      i = hex.next;
      continue;
    }
    if (OCTAL_DIGIT.test(next)) {
      const octal = decodeOctalEscape(raw, i + 1);
      out += octal.char;
      i = octal.next;
      continue;
    }
    const simple = SIMPLE_ESCAPES[next];
    if (simple === undefined) {
      throw new AdapterError(
        "INVALID_STRUCTURE",
        `The .po/.pot file has an unknown escape sequence "\\${next}" (line ${line}).`,
      );
    }
    out += simple;
    i += 2;
  }
  return out;
}

function escapeChar(char: string): string {
  switch (char) {
    case "\\":
      return "\\\\";
    case '"':
      return '\\"';
    case "\n":
      return "\\n";
    case "\t":
      return "\\t";
    case "\r":
      return "\\r";
    default:
      break;
  }
  const code = char.charCodeAt(0);
  return code < 0x20 ? `\\x${code.toString(16).padStart(2, "0")}` : char;
}

export function encodeCString(value: string): string {
  let out = "";
  for (const char of value) {
    out += escapeChar(char);
  }
  return out;
}
