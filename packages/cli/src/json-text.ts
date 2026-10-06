export interface JsonSpan {
  readonly start: number;
  readonly end: number;
}

const WHITESPACE = /\s/;
const LITERAL_END = /[\s,\]}]/;

function skipWhitespace(text: string, from: number): number {
  let index = from;
  while (index < text.length && WHITESPACE.test(text.charAt(index))) {
    index += 1;
  }
  return index;
}

function stringEnd(text: string, quote: number): number {
  let index = quote + 1;
  while (index < text.length && text.charAt(index) !== '"') {
    index += text.charAt(index) === "\\" ? 2 : 1;
  }
  return index + 1;
}

function containerEnd(text: string, open: number): number {
  let depth = 0;
  let index = open;
  while (index < text.length) {
    const char = text.charAt(index);
    if (char === '"') {
      index = stringEnd(text, index);
      continue;
    }
    if (char === "{" || char === "[") {
      depth += 1;
    } else if (char === "}" || char === "]") {
      depth -= 1;
      if (depth === 0) {
        return index + 1;
      }
    }
    index += 1;
  }
  return index;
}

function valueEnd(text: string, start: number): number {
  const char = text.charAt(start);
  if (char === "{" || char === "[") {
    return containerEnd(text, start);
  }
  if (char === '"') {
    return stringEnd(text, start);
  }
  let index = start;
  while (index < text.length && !LITERAL_END.test(text.charAt(index))) {
    index += 1;
  }
  return index;
}

export function rootObjectSpan(text: string): JsonSpan {
  const start = skipWhitespace(text, 0);
  return { start, end: containerEnd(text, start) };
}

export function memberValueSpan(text: string, object: JsonSpan, key: string): JsonSpan | undefined {
  let index = object.start + 1;
  while (index < object.end - 1) {
    index = skipWhitespace(text, index);
    if (text.charAt(index) === ",") {
      index += 1;
      continue;
    }
    if (text.charAt(index) !== '"') {
      return undefined;
    }
    const keyEnd = stringEnd(text, index);
    const name: unknown = JSON.parse(text.slice(index, keyEnd));
    const start = skipWhitespace(text, skipWhitespace(text, keyEnd) + 1);
    const end = valueEnd(text, start);
    if (name === key) {
      return { start, end };
    }
    index = end;
  }
  return undefined;
}

function lineIndent(
  text: string,
  position: number,
): { readonly indent: string; readonly own: boolean } {
  const lineStart = text.lastIndexOf("\n", position - 1) + 1;
  const before = text.slice(lineStart, position);
  const indent = /^[ \t]*/.exec(before)?.[0] ?? "";
  return { indent, own: indent === before };
}

function lastContentBefore(text: string, close: number): number {
  let index = close - 1;
  while (WHITESPACE.test(text.charAt(index))) {
    index -= 1;
  }
  return index;
}

export interface MemberLayout {
  readonly unit: string;
  readonly eol: string;
}

function renderMember(key: string, value: unknown, indent: string, layout: MemberLayout): string {
  const body = JSON.stringify(value, null, layout.unit).split("\n").join(`${layout.eol}${indent}`);
  return `${JSON.stringify(key)}: ${body}`;
}

export function appendMember(
  text: string,
  object: JsonSpan,
  member: { readonly key: string; readonly value: unknown },
  layout: MemberLayout,
): string | undefined {
  const close = object.end - 1;
  const last = lastContentBefore(text, close);
  const closing = lineIndent(text, close);
  if (last === object.start) {
    const outer = closing.own ? closing.indent : lineIndent(text, object.start).indent;
    const inner = `${outer}${layout.unit}`;
    const rendered = renderMember(member.key, member.value, inner, layout);
    return `${text.slice(0, object.start + 1)}${layout.eol}${inner}${rendered}${layout.eol}${outer}${text.slice(close)}`;
  }
  if (!closing.own) {
    return undefined;
  }
  const inner = `${closing.indent}${layout.unit}`;
  const rendered = renderMember(member.key, member.value, inner, layout);
  return `${text.slice(0, last + 1)},${layout.eol}${inner}${rendered}${text.slice(last + 1)}`;
}
