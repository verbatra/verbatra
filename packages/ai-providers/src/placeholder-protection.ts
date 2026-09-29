import type { TranslationEntry } from "@verbatra/core";

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

function distinctByLength(placeholders: readonly string[]): readonly string[] {
  return [...new Set(placeholders)]
    .filter((placeholder) => placeholder.length > 0)
    .sort((a, b) => b.length - a.length);
}

interface Scan {
  readonly text: string;
  readonly residual: string;
  readonly originals: readonly string[];
}

function scanPlaceholders(value: string, candidates: readonly string[]): Scan {
  let text = "";
  let residual = "";
  const originals: string[] = [];
  let index = 0;
  while (index < value.length) {
    const hit = candidates.find((candidate) => value.startsWith(candidate, index));
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
  const candidates = distinctByLength(placeholders).filter(
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
}

export function partitionForMasking(
  entries: readonly TranslationEntry[],
  options: MaskingOptions = {},
): MaskingPartition {
  const { protectable, unprotectable } = partitionByPlaceholders(entries);
  const masked: MaskedEntry[] = [];
  const unmaskable: TranslationEntry[] = [];
  for (const entry of unprotectable) {
    const keepMarkup = options.keepMarkup === true && containsMarkupTag(entry.value);
    const mask = maskPlaceholders(entry.value, entry.placeholders, { keepMarkup });
    if (mask === undefined) {
      unmaskable.push(entry);
    } else {
      masked.push({ entry, masked: mask });
    }
  }
  return { plain: protectable, masked, unprotectable: unmaskable };
}
