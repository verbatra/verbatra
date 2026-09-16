import { HTML_ELEMENT_NAMES } from "./html-elements.js";
import {
  countScannedItems,
  type InlineTag,
  isVoidElement,
  MAX_MARKUP_ITEMS,
  type ScannedMarkup,
  scanMarkup,
} from "./markup-scanner.js";
import { countTokens, multisetExcess } from "./multiset.js";
import { unsafeAttributeValues } from "./url-attributes.js";

export interface InlineMarkupComparison {
  readonly matches: boolean;
  readonly missing: readonly string[];
  readonly extra: readonly string[];
  readonly malformed: boolean;
  readonly tagLimitExceeded?: number;
}

export interface InlineMarkupOptions {
  readonly ignoreTags?: readonly string[];
}

interface IgnoredTags {
  readonly tokens: ReadonlySet<string>;
  readonly closingNames: ReadonlySet<string>;
}

interface WithoutIgnored {
  readonly tags: readonly InlineTag[];
  readonly unclosed: readonly string[];
}

interface SplitTags {
  readonly tags: readonly InlineTag[];
  readonly words: readonly InlineTag[];
}

interface TagStructure {
  readonly wellFormed: boolean;
  readonly depths: ReadonlyMap<string, number>;
}

const WORD_NAME = /^[\p{L}\p{N}_-]+$/u;

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

type OpenTags = Map<string, InlineTag[]>;

function collectIgnoredTags(tokens: readonly string[]): IgnoredTags {
  const ignoredTokens = new Set<string>();
  const closingNames = new Set<string>();
  for (const token of tokens) {
    const tag = singleTagIn(token);
    if (tag === undefined) {
      continue;
    }
    ignoredTokens.add(tag.token);
    if (tag.kind === "open") {
      closingNames.add(tag.name);
    }
  }
  return { tokens: ignoredTokens, closingNames };
}

function pairsWithIgnoredOpen(tag: InlineTag, ignored: IgnoredTags): boolean {
  return tag.kind === "close" && ignored.closingNames.has(tag.name);
}

function consumeIgnoredOpen(unclosed: Map<string, number>, name: string): boolean {
  const count = unclosed.get(name) ?? 0;
  if (count === 0) {
    return false;
  }
  unclosed.set(name, count - 1);
  return true;
}

function unclosedClosingTokens(unclosed: ReadonlyMap<string, number>): readonly string[] {
  const tokens: string[] = [];
  for (const [name, count] of unclosed) {
    for (let i = 0; i < count; i += 1) {
      tokens.push(`</${name}>`);
    }
  }
  return tokens;
}

function withoutIgnoredTags(tags: readonly InlineTag[], ignored: IgnoredTags): WithoutIgnored {
  if (ignored.tokens.size === 0) {
    return { tags, unclosed: [] };
  }
  const unclosed = new Map<string, number>();
  const kept: InlineTag[] = [];
  for (const tag of tags) {
    if (pairsWithIgnoredOpen(tag, ignored)) {
      if (!consumeIgnoredOpen(unclosed, tag.name)) {
        kept.push(tag);
      }
    } else if (ignored.tokens.has(tag.token)) {
      if (tag.kind === "open" && !isVoidElement(tag.name)) {
        unclosed.set(tag.name, (unclosed.get(tag.name) ?? 0) + 1);
      }
    } else {
      kept.push(tag);
    }
  }
  return { tags: kept, unclosed: unclosedClosingTokens(unclosed) };
}

function recordDepth(depths: Map<string, number>, name: string, depth: number): void {
  if (depth > (depths.get(name) ?? 0)) {
    depths.set(name, depth);
  }
}

function adjustCount(counts: Map<string, number>, name: string, delta: number): number {
  const count = (counts.get(name) ?? 0) + delta;
  counts.set(name, count);
  return count;
}

function structureOf(tags: readonly InlineTag[]): TagStructure {
  const open: string[] = [];
  const openCounts = new Map<string, number>();
  const depths = new Map<string, number>();
  for (const tag of tags) {
    if (tag.kind === "self" || isVoidElement(tag.name)) {
      continue;
    }
    if (tag.kind === "open") {
      open.push(tag.name);
      recordDepth(depths, tag.name, adjustCount(openCounts, tag.name, 1));
      continue;
    }
    if (open.pop() !== tag.name) {
      return { wellFormed: false, depths };
    }
    adjustCount(openCounts, tag.name, -1);
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

function compareScanned(source: SplitTags, translated: SplitTags): InlineMarkupComparison {
  const sourceCounts = countTokens(tokensOf([...source.tags, ...source.words]));
  const translatedCounts = countTokens(tokensOf([...translated.tags, ...translated.words]));
  const missing = multisetExcess(sourceCounts, translatedCounts);
  const extra = multisetExcess(translatedCounts, sourceCounts);
  if (missing.length > 0 || extra.length > 0) {
    return { matches: false, missing, extra, malformed: false };
  }
  const sourceStructure = structureOf(source.tags);
  if (!sourceStructure.wellFormed) {
    return MATCHED;
  }
  const translatedStructure = structureOf(translated.tags);
  if (!translatedStructure.wellFormed) {
    return MALFORMED;
  }
  return sameDepths(sourceStructure.depths, translatedStructure.depths) ? MATCHED : MALFORMED;
}

function pushOpener(open: OpenTags, tag: InlineTag): void {
  const stack = open.get(tag.name);
  if (stack === undefined) {
    open.set(tag.name, [tag]);
  } else {
    stack.push(tag);
  }
}

function takeOpener(open: OpenTags, name: string): InlineTag | undefined {
  return open.get(name)?.pop();
}

function remainingOpeners(open: OpenTags): readonly InlineTag[] {
  return [...open.values()].flat();
}

function isBracketedWord(tag: InlineTag): boolean {
  return tag.bare && WORD_NAME.test(tag.name);
}

function isProseWord(tag: InlineTag): boolean {
  return !tag.name.includes("-") && !HTML_ELEMENT_NAMES.has(tag.name.toLowerCase());
}

function splitBracketedWords(tags: readonly InlineTag[]): SplitTags {
  const open: OpenTags = new Map();
  for (const tag of tags) {
    if (tag.kind === "close") {
      takeOpener(open, tag.name);
    } else if (tag.kind === "open" && !isVoidElement(tag.name)) {
      pushOpener(open, tag);
    }
  }
  const words = new Set(remainingOpeners(open).filter(isBracketedWord));
  return {
    tags: tags.filter((tag) => !words.has(tag)),
    words: tags.filter((tag) => words.has(tag)),
  };
}

function inventedTags(translatedTags: readonly InlineTag[]): string[] {
  const invented: string[] = [];
  const open: OpenTags = new Map();
  for (const tag of translatedTags) {
    if (tag.kind === "self" || isVoidElement(tag.name)) {
      invented.push(tag.token);
    } else if (tag.kind === "open") {
      pushOpener(open, tag);
    } else {
      invented.push(tag.token);
      const opener = takeOpener(open, tag.name);
      if (opener !== undefined) {
        invented.push(opener.token);
      }
    }
  }
  invented.push(...tokensOf(remainingOpeners(open)));
  return invented;
}

function inventedWords(
  translatedWords: readonly InlineTag[],
  sourceWords: readonly InlineTag[],
): readonly string[] {
  const available = countTokens(tokensOf(sourceWords));
  const invented: string[] = [];
  for (const word of translatedWords) {
    const count = available.get(word.token) ?? 0;
    if (count > 0) {
      available.set(word.token, count - 1);
    } else if (!isProseWord(word)) {
      invented.push(word.token);
    }
  }
  return invented;
}

function withFindings(
  comparison: InlineMarkupComparison,
  missing: readonly string[],
  extra: readonly string[],
): InlineMarkupComparison {
  if (missing.length === 0 && extra.length === 0) {
    return comparison;
  }
  return {
    matches: false,
    missing: [...comparison.missing, ...missing].sort(),
    extra: [...comparison.extra, ...extra].sort(),
    malformed: false,
  };
}

function compareTags(source: WithoutIgnored, translated: WithoutIgnored): InlineMarkupComparison {
  const sourceSplit = splitBracketedWords(source.tags);
  const translatedSplit = splitBracketedWords(translated.tags);
  if (sourceSplit.tags.length === 0) {
    return compareAgainstUnmarkedSource(translatedSplit, sourceSplit.words);
  }
  return compareScanned(sourceSplit, translatedSplit);
}

function multisetDifference(
  expected: readonly string[],
  actual: readonly string[],
): { readonly missing: readonly string[]; readonly extra: readonly string[] } {
  const expectedCounts = countTokens(expected);
  const actualCounts = countTokens(actual);
  return {
    missing: multisetExcess(expectedCounts, actualCounts),
    extra: multisetExcess(actualCounts, expectedCounts),
  };
}

function compareScannedMarkup(
  source: ScannedMarkup,
  translated: ScannedMarkup,
  ignored: IgnoredTags,
): InlineMarkupComparison {
  const sourceKept = withoutIgnoredTags(source.tags, ignored);
  const translatedKept = withoutIgnoredTags(translated.tags, ignored);
  const constructs = multisetDifference(source.constructs, translated.constructs);
  const closingTags = multisetDifference(translatedKept.unclosed, sourceKept.unclosed);
  return withFindings(
    compareTags(sourceKept, translatedKept),
    [...constructs.missing, ...closingTags.missing],
    [...constructs.extra, ...closingTags.extra],
  );
}

function compareAgainstUnmarkedSource(
  translated: SplitTags,
  sourceWords: readonly InlineTag[],
): InlineMarkupComparison {
  const extra = [
    ...inventedTags(translated.tags),
    ...inventedWords(translated.words, sourceWords),
  ].sort();
  return extra.length === 0 ? MATCHED : { matches: false, missing: [], extra, malformed: false };
}

function readingFindings(
  identical: boolean,
  source: ScannedMarkup,
  translated: ScannedMarkup,
): readonly string[] {
  const findings = identical ? [] : [...translated.ambiguous];
  if (translated.unterminated !== undefined && source.unterminated === undefined) {
    findings.push(translated.unterminated);
  }
  return findings;
}

function singleTagIn(token: string): InlineTag | undefined {
  if (!token.startsWith("<") || !token.endsWith(">")) {
    return undefined;
  }
  const scanned = scanMarkup(token);
  return scanned?.constructs.length === 0 && scanned.tags.length === 1
    ? scanned.tags[0]
    : undefined;
}

export function inlineTagToken(token: string): string | undefined {
  return singleTagIn(token)?.token;
}

export function compareInlineMarkup(
  sourceValue: string,
  translatedValue: string,
  options: InlineMarkupOptions = {},
): InlineMarkupComparison {
  if (!sourceValue.includes("<") && !translatedValue.includes("<")) {
    return MATCHED;
  }
  const source = scanMarkup(sourceValue);
  const translated = scanMarkup(translatedValue);
  const limit = Math.max(MAX_MARKUP_ITEMS, 2 * countScannedItems(source));
  if (countScannedItems(translated) > limit) {
    return { matches: false, missing: [], extra: [], malformed: false, tagLimitExceeded: limit };
  }
  const ignored = collectIgnoredTags(options.ignoreTags ?? []);
  const reading = readingFindings(sourceValue === translatedValue, source, translated);
  const values = unsafeAttributeValues(source.tags, translated.tags);
  return withFindings(
    compareScannedMarkup(source, translated, ignored),
    [],
    [...reading, ...values],
  );
}
