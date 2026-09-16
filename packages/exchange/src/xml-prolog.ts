import { ExchangeError } from "./errors.js";

export interface PrologScan {
  readonly rootStart: number;
  readonly doctypeSpans: ReadonlyArray<readonly [number, number]>;
}

const DOCTYPE_OPEN = "<!DOCTYPE";

function invalid(message: string): ExchangeError {
  return new ExchangeError("TMX_INVALID", message);
}

function skipWhitespace(text: string, from: number): number {
  let cursor = from;
  while (cursor < text.length && /\s/.test(text[cursor] ?? "")) {
    cursor += 1;
  }
  return cursor;
}

function endOfDelimited(text: string, from: number, closing: string): number {
  const end = text.indexOf(closing, from);
  if (end === -1) {
    throw invalid(`The file is not valid XML: a ${closing} was never closed before the document.`);
  }
  return end + closing.length;
}

function endOfDoctype(text: string, from: number): number {
  let cursor = from + DOCTYPE_OPEN.length;
  while (cursor < text.length) {
    const char = text[cursor];
    if (char === "[") {
      throw invalid(
        "The file declares an internal DTD subset, which is refused because it can declare an entity.",
      );
    }
    if (char === '"' || char === "'") {
      cursor = endOfDelimited(text, cursor + 1, char);
      continue;
    }
    if (char === ">") {
      return cursor + 1;
    }
    cursor += 1;
  }
  throw invalid("The file is not valid XML: its DOCTYPE declaration is never closed.");
}

function startsDoctype(text: string, at: number): boolean {
  return text.slice(at, at + DOCTYPE_OPEN.length).toUpperCase() === DOCTYPE_OPEN;
}

export function scanProlog(text: string): PrologScan {
  const doctypeSpans: Array<readonly [number, number]> = [];
  let cursor = skipWhitespace(text, 0);
  while (cursor < text.length) {
    if (text[cursor] !== "<") {
      throw invalid("The file is not valid XML: content appears before the root element.");
    }
    if (text.startsWith("<?", cursor)) {
      cursor = skipWhitespace(text, endOfDelimited(text, cursor + 2, "?>"));
      continue;
    }
    if (text.startsWith("<!--", cursor)) {
      cursor = skipWhitespace(text, endOfDelimited(text, cursor + 4, "-->"));
      continue;
    }
    if (text.startsWith("<!", cursor) && !startsDoctype(text, cursor)) {
      throw invalid(
        "The file declares markup outside a DTD before its root element. An entity declaration is refused there, because it can expand without bound or name a file on this machine.",
      );
    }
    if (startsDoctype(text, cursor)) {
      const end = endOfDoctype(text, cursor);
      doctypeSpans.push([cursor, end]);
      cursor = skipWhitespace(text, end);
      continue;
    }
    return { rootStart: cursor, doctypeSpans };
  }
  throw invalid("The file is not valid XML: it has no root element.");
}

export function removeSpans(text: string, spans: ReadonlyArray<readonly [number, number]>): string {
  let result = text;
  for (const [start, end] of [...spans].reverse()) {
    result = `${result.slice(0, start)}${result.slice(end)}`;
  }
  return result;
}
