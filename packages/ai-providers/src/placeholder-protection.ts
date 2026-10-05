import type { TranslationEntry } from "@verbatra/core";
import type { IntegrityInput } from "./integrity.js";

export const PLACEHOLDER_UNSUPPORTED_MESSAGE =
  "Some entries were left untranslated: their placeholders could not be protected (ICU syntax or " +
  "reserved characters next to them) or did not come back intact. Translate them by hand or " +
  "with an LLM provider.";

export interface PlaceholderPartition {
  readonly protectable: readonly TranslationEntry[];
  readonly unprotectable: readonly TranslationEntry[];
}

export function partitionByPlaceholders(
  entries: readonly TranslationEntry[],
): PlaceholderPartition {
  const protectable: TranslationEntry[] = [];
  const unprotectable: TranslationEntry[] = [];
  for (const entry of entries) {
    if (entry.placeholders.length > 0) {
      unprotectable.push(entry);
    } else {
      protectable.push(entry);
    }
  }
  return { protectable, unprotectable };
}

function withForeignTokens(
  entry: TranslationEntry,
  tokens: readonly string[] | undefined,
): TranslationEntry {
  const added = (tokens ?? []).filter((token) => !entry.placeholders.includes(token));
  return added.length === 0 ? entry : { ...entry, placeholders: [...entry.placeholders, ...added] };
}

export function withForeignPlaceholders(
  entries: readonly TranslationEntry[],
  foreign: ReadonlyMap<string, readonly string[]> | undefined,
): readonly TranslationEntry[] {
  return foreign === undefined
    ? entries
    : entries.map((entry) => withForeignTokens(entry, foreign.get(entry.key)));
}

export interface MaskedValue {
  readonly text: string;
  readonly originals: readonly string[];
}

const RESERVED_IN_MASKED_TEXT = /[{}<>]/;
const RESERVED_BESIDE_MARKUP = /[{}]/;
const MARKUP_TAG = /<\/?[A-Za-z][\w:.-]*(?:\s[^<>]*)?\/?>/;
const WHOLE_MARKUP_TAG = new RegExp(`^${MARKUP_TAG.source}$`);
const MARKER = /\{(0|[1-9]\d*)\}/g;
const STRAY_BRACE = /[{}]/;

function markerFor(index: number): string {
  return `{${index}}`;
}

function distinctPlaceholders(placeholders: readonly string[]): readonly string[] {
  return [...new Set(placeholders)].filter((placeholder) => placeholder.length > 0);
}

interface Scan {
  readonly text: string;
  readonly residual: string;
  readonly originals: readonly string[];
}

interface CandidateNode {
  readonly next: Map<string, CandidateNode>;
  candidate?: string;
}

function candidateTrie(candidates: readonly string[]): CandidateNode {
  const root: CandidateNode = { next: new Map() };
  for (const candidate of candidates) {
    let node = root;
    for (let index = 0; index < candidate.length; index += 1) {
      const unit = candidate.charAt(index);
      const child = node.next.get(unit) ?? { next: new Map() };
      node.next.set(unit, child);
      node = child;
    }
    node.candidate = candidate;
  }
  return root;
}

function longestCandidateAt(root: CandidateNode, value: string, start: number): string | undefined {
  let longest: string | undefined;
  let node: CandidateNode | undefined = root;
  for (let index = start; node !== undefined && index < value.length; index += 1) {
    node = node.next.get(value.charAt(index));
    longest = node?.candidate ?? longest;
  }
  return longest;
}

function scanPlaceholders(value: string, candidates: readonly string[]): Scan {
  const trie = candidateTrie(candidates);
  let text = "";
  let residual = "";
  const originals: string[] = [];
  let index = 0;
  while (index < value.length) {
    const hit = longestCandidateAt(trie, value, index);
    if (hit === undefined) {
      const character = value.charAt(index);
      text += character;
      residual += character;
      index += 1;
    } else {
      text += markerFor(originals.length);
      originals.push(hit);
      index += hit.length;
    }
  }
  return { text, residual, originals };
}

export function containsMarkupTag(value: string): boolean {
  return MARKUP_TAG.test(value);
}

export interface MaskOptions {
  readonly keepMarkup?: boolean;
}

export function maskPlaceholders(
  value: string,
  placeholders: readonly string[],
  options: MaskOptions = {},
): MaskedValue | undefined {
  const keepMarkup = options.keepMarkup === true;
  const candidates = distinctPlaceholders(placeholders).filter(
    (candidate) => !(keepMarkup && WHOLE_MARKUP_TAG.test(candidate)),
  );
  if (candidates.length === 0 && !keepMarkup) {
    return undefined;
  }
  const scan = scanPlaceholders(value, candidates);
  const found = new Set(scan.originals);
  const everyPlaceholderLiteral = candidates.every((candidate) => found.has(candidate));
  const reserved = keepMarkup ? RESERVED_BESIDE_MARKUP : RESERVED_IN_MASKED_TEXT;
  if (!everyPlaceholderLiteral || reserved.test(scan.residual)) {
    return undefined;
  }
  return { text: scan.text, originals: scan.originals };
}

export function unmaskPlaceholders(translated: string, masked: MaskedValue): string | undefined {
  const restored = new Set<number>();
  let intact = true;
  const text = translated.replace(MARKER, (_marker, digits: string) => {
    const index = Number(digits);
    const original = masked.originals[index];
    if (original === undefined || restored.has(index)) {
      intact = false;
      return "";
    }
    restored.add(index);
    return original;
  });
  const complete = restored.size === masked.originals.length;
  const stray = STRAY_BRACE.test(translated.replace(MARKER, ""));
  return intact && complete && !stray ? text : undefined;
}

export interface MaskedEntry {
  readonly entry: TranslationEntry;
  readonly masked: MaskedValue;
}

export interface MaskingPartition {
  readonly plain: readonly TranslationEntry[];
  readonly masked: readonly MaskedEntry[];
  readonly unprotectable: readonly TranslationEntry[];
}

export interface MaskingOptions {
  readonly keepMarkup?: boolean;
  readonly withholdMarkup?: boolean;
}

function maskEntry(entry: TranslationEntry, options: MaskingOptions): MaskedValue | undefined {
  const hasMarkup = containsMarkupTag(entry.value);
  if (options.withholdMarkup === true && hasMarkup) {
    return undefined;
  }
  const keepMarkup = options.keepMarkup === true && hasMarkup;
  return maskPlaceholders(entry.value, entry.placeholders, { keepMarkup });
}

export function partitionForMasking(
  entries: readonly TranslationEntry[],
  options: MaskingOptions = {},
): MaskingPartition {
  const { protectable, unprotectable } = partitionByPlaceholders(entries);
  const masked: MaskedEntry[] = [];
  const unmaskable: TranslationEntry[] = [];
  for (const entry of unprotectable) {
    const mask = maskEntry(entry, options);
    if (mask === undefined) {
      unmaskable.push(entry);
    } else {
      masked.push({ entry, masked: mask });
    }
  }
  return { plain: protectable, masked, unprotectable: unmaskable };
}

export interface OutgoingText {
  readonly entry: TranslationEntry;
  readonly text: string;
  readonly masked?: MaskedValue;
}

export interface RestoredBatch {
  readonly values: Map<string, string>;
  readonly integrityInputs: IntegrityInput[];
  readonly translated: TranslationEntry[];
  readonly lost: number;
}

export type WireDecoder = (text: string) => string | undefined;

const passThrough: WireDecoder = (text) => text;

function restoreValue(item: OutgoingText, text: string, decode: WireDecoder): string | undefined {
  if (item.masked === undefined) {
    return text;
  }
  const decoded = decode(text);
  return decoded === undefined ? undefined : unmaskPlaceholders(decoded, item.masked);
}

export function restoreTranslations(
  pairs: ReadonlyArray<readonly [OutgoingText, string]>,
  decode: WireDecoder = passThrough,
): RestoredBatch {
  const values = new Map<string, string>();
  const integrityInputs: IntegrityInput[] = [];
  const kept: TranslationEntry[] = [];
  let lost = 0;
  for (const [item, text] of pairs) {
    const value = restoreValue(item, text, decode);
    if (value === undefined) {
      lost += 1;
      continue;
    }
    values.set(item.entry.key, value);
    integrityInputs.push({
      key: item.entry.key,
      sourceValue: item.entry.value,
      translatedValue: value,
    });
    kept.push(item.entry);
  }
  return { values, integrityInputs, translated: kept, lost };
}
