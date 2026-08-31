import { AdapterError } from "../errors.js";

export const CONTEXT_SEPARATOR = "";

const PLURAL_SUFFIX = /^\[(\d+)\]$/;

function assertNoReservedChar(raw: string, field: "msgctxt" | "msgid"): void {
  if (raw.includes(CONTEXT_SEPARATOR)) {
    throw new AdapterError(
      "INVALID_STRUCTURE",
      `The ${field} value contains a reserved private-use character (U+E000) that verbatra uses ` +
        "internally to combine msgctxt and msgid into one key. Remove it from the source file.",
    );
  }
}

function escapeBase(raw: string): string {
  return raw.replace(/\\/g, "\\\\").replace(/\[/g, "\\[");
}

function unescapeBase(escaped: string): string {
  let out = "";
  let i = 0;
  while (i < escaped.length) {
    const char = escaped[i];
    if (char === "\\" && i + 1 < escaped.length) {
      out += escaped[i + 1];
      i += 2;
      continue;
    }
    out += char;
    i += 1;
  }
  return out;
}

function findUnescapedBracket(base: string): number {
  let i = 0;
  while (i < base.length) {
    if (base[i] === "\\") {
      i += 2;
      continue;
    }
    if (base[i] === "[") {
      return i;
    }
    i += 1;
  }
  return -1;
}

export function composeKey(
  msgctxt: string | undefined,
  msgid: string,
  pluralIndex?: number,
): string {
  assertNoReservedChar(msgid, "msgid");
  if (msgctxt !== undefined) {
    assertNoReservedChar(msgctxt, "msgctxt");
  }
  const base =
    msgctxt === undefined
      ? escapeBase(msgid)
      : `${escapeBase(msgctxt)}${CONTEXT_SEPARATOR}${escapeBase(msgid)}`;
  return pluralIndex === undefined ? base : `${base}[${pluralIndex}]`;
}

export interface DecomposedKey {
  readonly msgctxt: string | undefined;
  readonly msgid: string;
  readonly pluralIndex: number | undefined;
}

export function decomposeKey(key: string): DecomposedKey {
  const bracketAt = findUnescapedBracket(key);
  let base = key;
  let pluralIndex: number | undefined;
  if (bracketAt !== -1) {
    const suffix = key.slice(bracketAt);
    const match = PLURAL_SUFFIX.exec(suffix);
    if (!match) {
      throw new AdapterError(
        "INVALID_STRUCTURE",
        `The key "${key}" has a malformed plural-index suffix.`,
      );
    }
    base = key.slice(0, bracketAt);
    pluralIndex = Number(match[1]);
  }
  const separatorAt = base.indexOf(CONTEXT_SEPARATOR);
  if (separatorAt === -1) {
    return { msgctxt: undefined, msgid: unescapeBase(base), pluralIndex };
  }
  return {
    msgctxt: unescapeBase(base.slice(0, separatorAt)),
    msgid: unescapeBase(base.slice(separatorAt + 1)),
    pluralIndex,
  };
}
