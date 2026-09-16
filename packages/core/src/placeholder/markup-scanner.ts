import { GREATER_THAN, isAsciiAlpha, isAsciiDigit, isHtmlSpace, SLASH } from "./html-chars.js";
import {
  isRawTextElement,
  type OccurrenceFinder,
  occurrenceFinder,
  opensForeignContext,
  readRawText,
} from "./raw-text.js";

export interface MarkupAttribute {
  readonly name: string;
  readonly value: string;
}

export interface InlineTag {
  readonly token: string;
  readonly name: string;
  readonly kind: "open" | "close" | "self";
  readonly bare: boolean;
  readonly attributes: readonly MarkupAttribute[];
}

export interface ScannedMarkup {
  readonly constructs: readonly string[];
  readonly tags: readonly InlineTag[];
  readonly ambiguous: readonly string[];
  readonly unterminated: string | undefined;
}

interface MutableScan {
  readonly constructs: string[];
  readonly tags: InlineTag[];
  readonly ambiguous: string[];
  unterminated: string | undefined;
  foreignPossible: boolean;
}

interface AttributeList {
  readonly attributes: readonly MarkupAttribute[];
  readonly selfClosing: boolean;
  readonly end: number;
}

interface AttributeValue {
  readonly text: string;
  readonly end: number;
}

interface Construct {
  readonly token: string | undefined;
  readonly end: number;
}

interface ReadTag {
  readonly tag: InlineTag | undefined;
  readonly end: number;
  readonly unterminated?: string;
}

interface CommentFinders {
  readonly dashEnd: OccurrenceFinder;
  readonly bangEnd: OccurrenceFinder;
  readonly escapeOpen: OccurrenceFinder;
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
const EQUALS = 61;
const QUESTION_MARK = 63;

export function isVoidElement(name: string): boolean {
  return VOID_ELEMENTS.has(name.toLowerCase());
}

function collapseWhitespace(text: string): string {
  return text.replace(WHITESPACE_RUN, " ");
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

function closesNumericTag(value: string, start: number): boolean {
  return value.charCodeAt(skipSpaces(value, digitsEnd(value, start + 2))) === GREATER_THAN;
}

function readEndTagOpen(value: string, start: number): Construct | undefined {
  const code = value.charCodeAt(start + 2);
  if (code === GREATER_THAN) {
    return { token: undefined, end: start + 3 };
  }
  const endTag = isAsciiAlpha(code) || (isAsciiDigit(code) && closesNumericTag(value, start));
  return endTag || start + 2 >= value.length ? undefined : readBogusComment(value, start);
}

function readConstruct(
  value: string,
  start: number,
  finders: CommentFinders,
  scan: MutableScan,
): Construct | undefined {
  if (value.startsWith("<!--", start)) {
    return readComment(value, start, finders);
  }
  const marker = value.charCodeAt(start + 1);
  if (marker === BANG || marker === QUESTION_MARK) {
    if (scan.foreignPossible && value.startsWith("<![CDATA[", start)) {
      scan.ambiguous.push("<![CDATA[...]]>");
    }
    return readBogusComment(value, start);
  }
  return marker === SLASH ? readEndTagOpen(value, start) : undefined;
}

function openTagToken(
  name: string,
  attributeList: readonly MarkupAttribute[],
  selfClosing: boolean,
): string {
  const names = attributeList.map((attribute) => attribute.name).sort();
  const attributes = names.length === 0 ? "" : ` ${names.join(" ")}`;
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

function unquotedValueEnd(value: string, from: number): number {
  let index = from;
  while (index < value.length) {
    const code = value.charCodeAt(index);
    if (isHtmlSpace(code) || code === GREATER_THAN) {
      return index;
    }
    index += 1;
  }
  return index;
}

function readAttributeValue(value: string, from: number): AttributeValue {
  if (value.charCodeAt(from) !== EQUALS) {
    return { text: "", end: from };
  }
  const index = skipSpaces(value, from + 1);
  const quote = value.charCodeAt(index);
  if (quote === DOUBLE_QUOTE || quote === SINGLE_QUOTE) {
    const close = value.indexOf(String.fromCharCode(quote), index + 1);
    return close === -1
      ? { text: "", end: value.length }
      : { text: value.slice(index + 1, close), end: close + 1 };
  }
  const end = unquotedValueEnd(value, index);
  return { text: value.slice(index, end), end };
}

function readAttributes(value: string, from: number): AttributeList | undefined {
  const attributes: MarkupAttribute[] = [];
  let index = from;
  while (index < value.length) {
    const code = value.charCodeAt(index);
    if (code === GREATER_THAN) {
      return { attributes, selfClosing: false, end: index + 1 };
    }
    if (code === SLASH && value.charCodeAt(index + 1) === GREATER_THAN) {
      return { attributes, selfClosing: true, end: index + 2 };
    }
    if (isHtmlSpace(code) || code === SLASH) {
      index += 1;
    } else {
      const nameEnd = attributeNameEnd(value, index + 1);
      const attributeValue = readAttributeValue(value, skipSpaces(value, nameEnd));
      attributes.push({ name: value.slice(index, nameEnd), value: attributeValue.text });
      index = attributeValue.end;
    }
  }
  return undefined;
}

function readNamedTag(value: string, start: number, closing: boolean): ReadTag {
  const nameStart = start + (closing ? 2 : 1);
  const nameEnd = tagNameEnd(value, nameStart);
  const name = value.slice(nameStart, nameEnd);
  const attributes = readAttributes(value, nameEnd);
  if (attributes === undefined) {
    return { tag: undefined, end: value.length, unterminated: `<${closing ? "/" : ""}${name}` };
  }
  const bare = attributes.end === nameEnd + 1;
  const end = attributes.end;
  if (closing) {
    return { tag: { token: `</${name}>`, name, kind: "close", bare, attributes: [] }, end };
  }
  const token = openTagToken(name, attributes.attributes, attributes.selfClosing);
  const kind = attributes.selfClosing ? "self" : "open";
  return { tag: { token, name, kind, bare, attributes: attributes.attributes }, end };
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

function readNumericClose(name: string, nameEnd: number, close: number): ReadTag {
  const bare = close === nameEnd;
  return {
    tag: { token: `</${name}>`, name, kind: "close", bare, attributes: [] },
    end: close + 1,
  };
}

function readNumericOpen(value: string, start: number, name: string, nameEnd: number): ReadTag {
  const selfClosing = value.charCodeAt(nameEnd) === SLASH;
  const close = selfClosing ? nameEnd + 1 : nameEnd;
  if (value.charCodeAt(close) !== GREATER_THAN) {
    return textAt(start);
  }
  const token = openTagToken(name, [], selfClosing);
  const kind = selfClosing ? "self" : "open";
  return { tag: { token, name, kind, bare: !selfClosing, attributes: [] }, end: close + 1 };
}

function readNumericTag(value: string, start: number, closing: boolean): ReadTag {
  const nameStart = start + (closing ? 2 : 1);
  const nameEnd = digitsEnd(value, nameStart);
  const name = value.slice(nameStart, nameEnd);
  return closing
    ? readNumericClose(name, nameEnd, skipSpaces(value, nameEnd))
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

function continueAfterTag(
  value: string,
  tag: InlineTag,
  end: number,
  finders: CommentFinders,
  scan: MutableScan,
): number {
  const name = tag.name.toLowerCase();
  if (tag.kind === "close" || !isRawTextElement(name)) {
    scan.foreignPossible ||= tag.kind !== "close" && opensForeignContext(name);
    return end;
  }
  const context = { value, escapeOpen: finders.escapeOpen, foreignPossible: scan.foreignPossible };
  const span = readRawText(context, name, end);
  if (span.ambiguous) {
    scan.ambiguous.push(`<${name}>...</${name}>`);
  }
  return span.end;
}

function scanAt(value: string, start: number, finders: CommentFinders, scan: MutableScan): number {
  const construct = readConstruct(value, start, finders, scan);
  if (construct !== undefined) {
    if (construct.token !== undefined) {
      scan.constructs.push(construct.token);
    }
    return construct.end;
  }
  const { tag, end, unterminated } = readTag(value, start);
  if (unterminated !== undefined) {
    scan.unterminated = unterminated;
  }
  if (tag === undefined) {
    return end;
  }
  scan.tags.push(tag);
  return continueAfterTag(value, tag, end, finders, scan);
}

export function countScannedItems(scan: ScannedMarkup): number {
  return scan.constructs.length + scan.tags.length;
}

export function scanMarkup(value: string): ScannedMarkup {
  const scan: MutableScan = {
    constructs: [],
    tags: [],
    ambiguous: [],
    unterminated: undefined,
    foreignPossible: false,
  };
  const finders: CommentFinders = {
    dashEnd: occurrenceFinder(value, "-->"),
    bangEnd: occurrenceFinder(value, "--!>"),
    escapeOpen: occurrenceFinder(value, "<!--"),
  };
  let start = value.indexOf("<");
  while (start !== -1) {
    const end = scanAt(value, start, finders, scan);
    start = end >= value.length ? -1 : value.indexOf("<", end);
  }
  return scan;
}
