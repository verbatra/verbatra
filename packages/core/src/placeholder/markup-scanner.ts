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

const TAG_AT = /<(\/?)([A-Za-z_][A-Za-z0-9_.:-]*|[0-9]+)([^<>]*)>/y;

const ATTRIBUTE = /\s+([^\s"'=<>`/]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/y;

const NUMERIC_NAME = /^[0-9]+$/;

const WHITESPACE_RUN = /\s+/g;

const ASCII_ALPHANUMERIC = /^[A-Za-z0-9]$/;

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

function opensEndTag(value: string, start: number): boolean {
  return ASCII_ALPHANUMERIC.test(value.charAt(start + 2));
}

function readConstruct(
  value: string,
  start: number,
  finders: CommentFinders,
): Construct | undefined {
  if (value.startsWith("<!--", start)) {
    return readComment(value, start, finders);
  }
  const marker = value.charAt(start + 1);
  if (marker === "!" || marker === "?") {
    return readBogusComment(value, start);
  }
  if (marker === "/" && start + 2 < value.length && !opensEndTag(value, start)) {
    return readBogusComment(value, start);
  }
  return undefined;
}

function attributeNames(chunk: string): readonly string[] | undefined {
  const names: string[] = [];
  let consumed = 0;
  while (consumed < chunk.length) {
    ATTRIBUTE.lastIndex = consumed;
    const match = ATTRIBUTE.exec(chunk);
    if (match === null) {
      return chunk.slice(consumed).trim() === "" ? names : undefined;
    }
    /* v8 ignore next -- the name group in ATTRIBUTE is mandatory, so a match always carries it. */
    names.push(match[1] ?? "");
    consumed = ATTRIBUTE.lastIndex;
  }
  return names;
}

function openTagToken(name: string, names: readonly string[], selfClosing: boolean): string {
  const attributes = names.length === 0 ? "" : ` ${[...names].sort().join(" ")}`;
  const marker = selfClosing && !isVoidElement(name) ? "/" : "";
  return `<${name}${attributes}${marker}>`;
}

function tagFrom(slash: string, name: string, chunk: string): InlineTag | undefined {
  if (slash === "/") {
    return chunk.trim() === ""
      ? { token: `</${name}>`, name, kind: "close", bare: chunk === "" }
      : undefined;
  }
  const selfClosing = chunk.endsWith("/");
  const names = attributeNames(selfClosing ? chunk.slice(0, -1) : chunk);
  if (names === undefined) {
    return undefined;
  }
  if (names.length > 0 && NUMERIC_NAME.test(name)) {
    return undefined;
  }
  return {
    token: openTagToken(name, names, selfClosing),
    name,
    kind: selfClosing ? "self" : "open",
    bare: chunk === "",
  };
}

function readTag(value: string, start: number): ReadTag {
  TAG_AT.lastIndex = start;
  const match = TAG_AT.exec(value);
  if (match === null) {
    return { tag: undefined, end: start + 1 };
  }
  /* v8 ignore next 2 -- every group in TAG_AT is mandatory, so a match always carries all three. */
  const tag = tagFrom(match[1] ?? "", match[2] ?? "", match[3] ?? "");
  return { tag, end: TAG_AT.lastIndex };
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
