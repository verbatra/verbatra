import { GREATER_THAN, isHtmlSpace, SLASH } from "./html-chars.js";

export type OccurrenceFinder = (start: number) => number;

export interface RawTextContext {
  readonly value: string;
  readonly escapeOpen: OccurrenceFinder;
  readonly foreignPossible: boolean;
}

export interface RawTextSpan {
  readonly end: number;
  readonly ambiguous: boolean;
}

const RAW_TEXT_ELEMENTS: ReadonlySet<string> = new Set([
  "iframe",
  "noembed",
  "noframes",
  "noscript",
  "plaintext",
  "script",
  "style",
  "textarea",
  "title",
  "xmp",
]);

const FOREIGN_CONTEXT_ELEMENTS: ReadonlySet<string> = new Set(["math", "select", "svg"]);

export function occurrenceFinder(value: string, needle: string): OccurrenceFinder {
  let searchedFrom = Number.POSITIVE_INFINITY;
  let found = -1;
  return (start) => {
    const reusable = start >= searchedFrom && (found === -1 || found >= start);
    if (!reusable) {
      searchedFrom = start;
      found = value.indexOf(needle, start);
    }
    return found;
  };
}

export function isRawTextElement(name: string): boolean {
  return RAW_TEXT_ELEMENTS.has(name);
}

export function opensForeignContext(name: string): boolean {
  return FOREIGN_CONTEXT_ELEMENTS.has(name);
}

function isEndTagOf(value: string, nameStart: number, name: string): boolean {
  for (let offset = 0; offset < name.length; offset += 1) {
    if ((value.charCodeAt(nameStart + offset) | 32) !== name.charCodeAt(offset)) {
      return false;
    }
  }
  const next = value.charCodeAt(nameStart + name.length);
  return isHtmlSpace(next) || next === SLASH || next === GREATER_THAN;
}

function rawTextEnd(value: string, from: number, name: string): number {
  if (name === "plaintext") {
    return value.length;
  }
  let index = value.indexOf("</", from);
  while (index !== -1) {
    if (isEndTagOf(value, index + 2, name)) {
      return index;
    }
    index = value.indexOf("</", index + 2);
  }
  return value.length;
}

function holdsBefore(found: number, end: number): boolean {
  return found !== -1 && found < end;
}

function readsAmbiguously(
  context: RawTextContext,
  name: string,
  from: number,
  end: number,
): boolean {
  if (!holdsBefore(context.value.indexOf("<", from), end)) {
    return false;
  }
  if (name === "noscript" || context.foreignPossible) {
    return true;
  }
  return name === "script" && holdsBefore(context.escapeOpen(from), end);
}

export function readRawText(context: RawTextContext, name: string, from: number): RawTextSpan {
  const end = rawTextEnd(context.value, from, name);
  return { end, ambiguous: readsAmbiguously(context, name, from, end) };
}
