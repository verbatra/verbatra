import { countTokens, multisetExcess } from "./multiset.js";

export interface InlineMarkupComparison {
  readonly matches: boolean;
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly malformed: boolean;
}

interface InlineTag {
  readonly token: string;
  readonly name: string;
  readonly kind: "open" | "close" | "self";
}

const MAX_TAGS = 256;

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

const IGNORABLE_MARKUP = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^<>]*>|<\?[\s\S]*?\?>/g;

const TAG = /<(\/?)([A-Za-z_][A-Za-z0-9_.:-]*|[0-9]+)([^<>]*)>/g;

const ATTRIBUTE = /\s+([^\s"'=<>`/]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?/y;

const NUMERIC_NAME = /^[0-9]+$/;

const MATCHED: InlineMarkupComparison = {
  matches: true,
  missing: [],
  extra: [],
  malformed: false,
};

function attributeNames(chunk: string): readonly string[] | undefined {
  const names: string[] = [];
  ATTRIBUTE.lastIndex = 0;
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
  return `<${name}${attributes}${selfClosing ? "/" : ""}>`;
}

function readTag(slash: string, name: string, chunk: string): InlineTag | undefined {
  if (slash === "/") {
    return chunk.trim() === "" ? { token: `</${name}>`, name, kind: "close" } : undefined;
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
  };
}

function scanInlineTags(value: string): readonly InlineTag[] | undefined {
  const scannable = value.replace(IGNORABLE_MARKUP, "");
  const tags: InlineTag[] = [];
  TAG.lastIndex = 0;
  for (let match = TAG.exec(scannable); match !== null; match = TAG.exec(scannable)) {
    /* v8 ignore next 2 -- every group in TAG is mandatory, so a match always carries all three. */
    const tag = readTag(match[1] ?? "", match[2] ?? "", match[3] ?? "");
    if (tag !== undefined) {
      if (tags.length === MAX_TAGS) {
        return undefined;
      }
      tags.push(tag);
    }
  }
  return tags;
}

function isWellFormed(tags: readonly InlineTag[]): boolean {
  const open: string[] = [];
  for (const tag of tags) {
    if (tag.kind === "self" || VOID_ELEMENTS.has(tag.name.toLowerCase())) {
      continue;
    }
    if (tag.kind === "open") {
      open.push(tag.name);
      continue;
    }
    if (open.pop() !== tag.name) {
      return false;
    }
  }
  return open.length === 0;
}

function tokensOf(tags: readonly InlineTag[]): readonly string[] {
  return tags.map((tag) => tag.token);
}

function compareScanned(
  sourceTags: readonly InlineTag[],
  translatedTags: readonly InlineTag[],
): InlineMarkupComparison {
  const sourceCounts = countTokens(tokensOf(sourceTags));
  const translatedCounts = countTokens(tokensOf(translatedTags));
  const missing = multisetExcess(sourceCounts, translatedCounts);
  const extra = multisetExcess(translatedCounts, sourceCounts);
  if (missing.length > 0 || extra.length > 0) {
    return { matches: false, missing, extra, malformed: false };
  }
  if (!isWellFormed(translatedTags)) {
    return { matches: false, missing: [], extra: [], malformed: true };
  }
  return MATCHED;
}

function compareAgainstUnmarkedSource(
  translatedTags: readonly InlineTag[],
): InlineMarkupComparison {
  if (translatedTags.length === 0 || !isWellFormed(translatedTags)) {
    return MATCHED;
  }
  return {
    matches: false,
    missing: [],
    extra: multisetExcess(countTokens(tokensOf(translatedTags)), new Map()),
    malformed: false,
  };
}

export function compareInlineMarkup(
  sourceValue: string,
  translatedValue: string,
): InlineMarkupComparison {
  if (!sourceValue.includes("<") && !translatedValue.includes("<")) {
    return MATCHED;
  }
  const sourceTags = scanInlineTags(sourceValue);
  const translatedTags = scanInlineTags(translatedValue);
  if (sourceTags === undefined || translatedTags === undefined) {
    return MATCHED;
  }
  if (sourceTags.length === 0) {
    return compareAgainstUnmarkedSource(translatedTags);
  }
  if (!isWellFormed(sourceTags)) {
    return MATCHED;
  }
  return compareScanned(sourceTags, translatedTags);
}
