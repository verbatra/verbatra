export interface InlineTag {
  readonly token: string;
  readonly name: string;
  readonly kind: "open" | "close" | "self";
  readonly bare: boolean;
}

export interface ScannedMarkup {
  readonly constructs: readonly string[];
  readonly tags: readonly InlineTag[];
}

interface MutableScan {
  readonly constructs: string[];
  readonly tags: InlineTag[];
}

interface AttributeList {
  readonly names: readonly string[];
  readonly selfClosing: boolean;
  readonly end: number;
}

interface Construct {
  readonly token: string;
  readonly end: number;
}

interface ReadTag {
  readonly tag: InlineTag | undefined;
  readonly end: number;
}

type OccurrenceFinder = (start: number) => number;

interface CommentFinders {
  readonly dashEnd: OccurrenceFinder;
  readonly bangEnd: OccurrenceFinder;
}

export const MAX_MARKUP_ITEMS = 256;

const VOID_ELEMENTS: ReadonlySet<string> = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const WHITESPACE_RUN = /\s+/g;

const BANG = 33;
const DOUBLE_QUOTE = 34;
const SINGLE_QUOTE = 39;
const SLASH = 47;
const EQUALS = 61;
const GREATER_THAN = 62;
const QUESTION_MARK = 63;

export function isVoidElement(name: string): boolean {
  return VOID_ELEMENTS.has(name.toLowerCase());
}

function collapseWhitespace(text: string): string {
  return text.replace(WHITESPACE_RUN, " ");
}

function occurrenceFinder(value: string, needle: string): OccurrenceFinder {
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

function readComment(value: string, start: number, finders: CommentFinders): Construct {
  const dash = finders.dashEnd(start + 2);
  const bang = finders.bangEnd(start + 4);
  const useBang = bang !== -1 && (dash === -1 || bang < dash);
  const close = useBang ? bang : dash;
  if (close === -1) {
    return { token: `<!--${collapseWhitespace(value.slice(start + 4))}`, end: value.length };
  }
  const content = close > start + 4 ? value.slice(start + 4, close) : "";
  return {
    token: `<!--${collapseWhitespace(content)}-->`,
    end: close + (useBang ? 4 : 3),
  };
}

function readBogusComment(value: string, start: number): Construct {
  const close = value.indexOf(">", start + 2);
  const end = close === -1 ? value.length : close + 1;
  return { token: collapseWhitespace(value.slice(start, end)), end };
}

function isAsciiAlpha(code: number): boolean {
  const lower = code | 32;
  return lower >= 97 && lower <= 122;
}

function isAsciiDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function isHtmlSpace(code: number): boolean {
  return code === 9 || code === 10 || code === 12 || code === 13 || code === 32;
}

function opensEndTag(value: string, start: number): boolean {
  const code = value.charCodeAt(start + 2);
  return isAsciiAlpha(code) || isAsciiDigit(code);
}

function readConstruct(
  value: string,
  start: number,
  finders: CommentFinders,
): Construct | undefined {
  if (value.startsWith("<!--", start)) {
    return readComment(value, start, finders);
  }
  const marker = value.charCodeAt(start + 1);
  if (marker === BANG || marker === QUESTION_MARK) {
    return readBogusComment(value, start);
  }
  if (marker === SLASH && start + 2 < value.length && !opensEndTag(value, start)) {
    return readBogusComment(value, start);
  }
  return undefined;
}

function openTagToken(name: string, names: readonly string[], selfClosing: boolean): string {
  const attributes = names.length === 0 ? "" : ` ${[...names].sort().join(" ")}`;
  const marker = selfClosing && !isVoidElement(name) ? "/" : "";
  return `<${name}${attributes}${marker}>`;
}

function skipSpaces(value: string, from: number): number {
  let index = from;
  while (index < value.length && isHtmlSpace(value.charCodeAt(index))) {
    index += 1;
  }
  return index;
}

function endsTagName(code: number): boolean {
  return isHtmlSpace(code) || code === SLASH || code === GREATER_THAN;
}

function tagNameEnd(value: string, from: number): number {
  let index = from;
  while (index < value.length && !endsTagName(value.charCodeAt(index))) {
    index += 1;
  }
  return index;
}

function attributeNameEnd(value: string, from: number): number {
  let index = from;
  while (index < value.length) {
    const code = value.charCodeAt(index);
    if (endsTagName(code) || code === EQUALS) {
      return index;
    }
    index += 1;
  }
  return index;
}

function attributeValueEnd(value: string, from: number): number {
  if (value.charCodeAt(from) !== EQUALS) {
    return from;
  }
  let index = skipSpaces(value, from + 1);
  const quote = value.charCodeAt(index);
  if (quote === DOUBLE_QUOTE || quote === SINGLE_QUOTE) {
    const close = value.indexOf(String.fromCharCode(quote), index + 1);
    return close === -1 ? value.length : close + 1;
  }
  while (index < value.length) {
    const code = value.charCodeAt(index);
    if (isHtmlSpace(code) || code === GREATER_THAN) {
      return index;
    }
    index += 1;
  }
  return index;
}

function readAttributes(value: string, from: number): AttributeList | undefined {
  const names: string[] = [];
  let index = from;
  while (index < value.length) {
    const code = value.charCodeAt(index);
    if (code === GREATER_THAN) {
      return { names, selfClosing: false, end: index + 1 };
    }
    if (code === SLASH && value.charCodeAt(index + 1) === GREATER_THAN) {
      return { names, selfClosing: true, end: index + 2 };
    }
    if (isHtmlSpace(code) || code === SLASH) {
      index += 1;
    } else {
      const nameEnd = attributeNameEnd(value, index + 1);
      names.push(value.slice(index, nameEnd));
      index = attributeValueEnd(value, skipSpaces(value, nameEnd));
    }
  }
  return undefined;
}

function readNamedTag(value: string, start: number, closing: boolean): ReadTag {
  const nameStart = start + (closing ? 2 : 1);
  const nameEnd = tagNameEnd(value, nameStart);
  const attributes = readAttributes(value, nameEnd);
  if (attributes === undefined) {
    return { tag: undefined, end: value.length };
  }
  const name = value.slice(nameStart, nameEnd);
  const bare = attributes.end === nameEnd + 1;
  if (closing) {
    return { tag: { token: `</${name}>`, name, kind: "close", bare }, end: attributes.end };
  }
  const { names, selfClosing } = attributes;
  const token = openTagToken(name, names, selfClosing);
  return { tag: { token, name, kind: selfClosing ? "self" : "open", bare }, end: attributes.end };
}

function digitsEnd(value: string, from: number): number {
  let index = from;
  while (index < value.length && isAsciiDigit(value.charCodeAt(index))) {
    index += 1;
  }
  return index;
}

function textAt(start: number): ReadTag {
  return { tag: undefined, end: start + 1 };
}

function readNumericClose(value: string, start: number, name: string, nameEnd: number): ReadTag {
  const close = skipSpaces(value, nameEnd);
  if (value.charCodeAt(close) !== GREATER_THAN) {
    return textAt(start);
  }
  const bare = close === nameEnd;
  return { tag: { token: `</${name}>`, name, kind: "close", bare }, end: close + 1 };
}

function readNumericOpen(value: string, start: number, name: string, nameEnd: number): ReadTag {
  const selfClosing = value.charCodeAt(nameEnd) === SLASH;
  const close = selfClosing ? nameEnd + 1 : nameEnd;
  if (value.charCodeAt(close) !== GREATER_THAN) {
    return textAt(start);
  }
  const token = openTagToken(name, [], selfClosing);
  const kind = selfClosing ? "self" : "open";
  return { tag: { token, name, kind, bare: !selfClosing }, end: close + 1 };
}

function readNumericTag(value: string, start: number, closing: boolean): ReadTag {
  const nameStart = start + (closing ? 2 : 1);
  const nameEnd = digitsEnd(value, nameStart);
  const name = value.slice(nameStart, nameEnd);
  return closing
    ? readNumericClose(value, start, name, nameEnd)
    : readNumericOpen(value, start, name, nameEnd);
}

function readTag(value: string, start: number): ReadTag {
  const closing = value.charCodeAt(start + 1) === SLASH;
  const first = value.charCodeAt(start + (closing ? 2 : 1));
  if (isAsciiAlpha(first)) {
    return readNamedTag(value, start, closing);
  }
  if (isAsciiDigit(first)) {
    return readNumericTag(value, start, closing);
  }
  return textAt(start);
}

function isFull(scan: MutableScan): boolean {
  return scan.constructs.length + scan.tags.length === MAX_MARKUP_ITEMS;
}

function scanAt(
  value: string,
  start: number,
  finders: CommentFinders,
  scan: MutableScan,
): number | undefined {
  const construct = readConstruct(value, start, finders);
  if (construct !== undefined) {
    if (isFull(scan)) {
      return undefined;
    }
    scan.constructs.push(construct.token);
    return construct.end;
  }
  const { tag, end } = readTag(value, start);
  if (tag !== undefined) {
    if (isFull(scan)) {
      return undefined;
    }
    scan.tags.push(tag);
  }
  return end;
}

export function scanMarkup(value: string): ScannedMarkup | undefined {
  const scan: MutableScan = { constructs: [], tags: [] };
  const finders: CommentFinders = {
    dashEnd: occurrenceFinder(value, "-->"),
    bangEnd: occurrenceFinder(value, "--!>"),
  };
  let start = value.indexOf("<");
  while (start !== -1) {
    const end = scanAt(value, start, finders, scan);
    if (end === undefined) {
      return undefined;
    }
    start = end >= value.length ? -1 : value.indexOf("<", end);
  }
  return scan;
}
