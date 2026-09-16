import { countTokens, multisetExcess } from "./multiset.js";

export interface InlineMarkupComparison {
  readonly matches: boolean;
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly malformed: boolean;
}

export interface InlineMarkupOptions {
  readonly ignoreTagNames?: readonly string[];
  readonly pluralArms?: boolean;
}

interface InlineTag {
  readonly token: string;
  readonly name: string;
  readonly kind: "open" | "close" | "self";
}

interface TagStructure {
  readonly wellFormed: boolean;
  readonly depths: ReadonlyMap<string, number>;
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

const MALFORMED: InlineMarkupComparison = {
  matches: false,
  missing: [],
  extra: [],
  malformed: true,
};

function isVoidElement(name: string): boolean {
  return VOID_ELEMENTS.has(name.toLowerCase());
}

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
  const marker = selfClosing && !isVoidElement(name) ? "/" : "";
  return `<${name}${attributes}${marker}>`;
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

function withoutIgnoredNames(
  tags: readonly InlineTag[],
  ignored: ReadonlySet<string>,
): readonly InlineTag[] {
  return ignored.size === 0 ? tags : tags.filter((tag) => !ignored.has(tag.name));
}

function recordDepth(depths: Map<string, number>, name: string, depth: number): void {
  if (depth > (depths.get(name) ?? 0)) {
    depths.set(name, depth);
  }
}

function structureOf(tags: readonly InlineTag[]): TagStructure {
  const open: string[] = [];
  const depths = new Map<string, number>();
  for (const tag of tags) {
    if (tag.kind === "self" || isVoidElement(tag.name)) {
      continue;
    }
    if (tag.kind === "open") {
      open.push(tag.name);
      recordDepth(depths, tag.name, open.filter((name) => name === tag.name).length);
      continue;
    }
    if (open.pop() !== tag.name) {
      return { wellFormed: false, depths };
    }
  }
  return { wellFormed: open.length === 0, depths };
}

function sameDepths(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): boolean {
  /* v8 ignore next 3 -- depths are only compared once the token multisets match, which forces the
   * two maps to hold the same names; the size guard keeps the comparison correct without it. */
  if (a.size !== b.size) {
    return false;
  }
  for (const [name, depth] of a) {
    if (b.get(name) !== depth) {
      return false;
    }
  }
  return true;
}

function tokensOf(tags: readonly InlineTag[]): readonly string[] {
  return tags.map((tag) => tag.token);
}

function presenceCounts(tokens: readonly string[]): Map<string, number> {
  const counts = countTokens(tokens);
  for (const token of counts.keys()) {
    counts.set(token, 1);
  }
  return counts;
}

function compareScanned(
  sourceTags: readonly InlineTag[],
  translatedTags: readonly InlineTag[],
  sourceStructure: TagStructure,
  pluralArms: boolean,
): InlineMarkupComparison {
  const count = pluralArms ? presenceCounts : countTokens;
  const sourceCounts = count(tokensOf(sourceTags));
  const translatedCounts = count(tokensOf(translatedTags));
  const missing = multisetExcess(sourceCounts, translatedCounts);
  const extra = multisetExcess(translatedCounts, sourceCounts);
  if (missing.length > 0 || extra.length > 0) {
    return { matches: false, missing, extra, malformed: false };
  }
  const translatedStructure = structureOf(translatedTags);
  if (!translatedStructure.wellFormed) {
    return MALFORMED;
  }
  return sameDepths(sourceStructure.depths, translatedStructure.depths) ? MATCHED : MALFORMED;
}

function compareAgainstUnmarkedSource(
  translatedTags: readonly InlineTag[],
): InlineMarkupComparison {
  if (translatedTags.length === 0 || !structureOf(translatedTags).wellFormed) {
    return MATCHED;
  }
  return {
    matches: false,
    missing: [],
    extra: [...tokensOf(translatedTags)].sort(),
    malformed: false,
  };
}

export function inlineTagName(token: string): string | undefined {
  if (!token.startsWith("<") || !token.endsWith(">")) {
    return undefined;
  }
  const tags = scanInlineTags(token);
  return tags?.length === 1 ? tags[0]?.name : undefined;
}

export function compareInlineMarkup(
  sourceValue: string,
  translatedValue: string,
  options: InlineMarkupOptions = {},
): InlineMarkupComparison {
  if (!sourceValue.includes("<") && !translatedValue.includes("<")) {
    return MATCHED;
  }
  const scannedSource = scanInlineTags(sourceValue);
  const scannedTranslated = scanInlineTags(translatedValue);
  if (scannedSource === undefined || scannedTranslated === undefined) {
    return MATCHED;
  }
  const ignored = new Set(options.ignoreTagNames ?? []);
  const sourceTags = withoutIgnoredNames(scannedSource, ignored);
  const translatedTags = withoutIgnoredNames(scannedTranslated, ignored);
  if (sourceTags.length === 0) {
    return compareAgainstUnmarkedSource(translatedTags);
  }
  const sourceStructure = structureOf(sourceTags);
  if (!sourceStructure.wellFormed) {
    return MATCHED;
  }
  return compareScanned(sourceTags, translatedTags, sourceStructure, options.pluralArms === true);
}
