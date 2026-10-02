import type { TranslationEntry } from "@verbatra/core";
import type { IntegrityInput } from "./integrity.js";

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

const MARKER_OR_ESCAPED = /\{(?:0|[1-9]\d*)\}|[&<>]/g;
const ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const XML_WRAPPED_MARKER = /<x>(\{(?:0|[1-9]\d*)\})<\/x>/;
const HTML_WRAPPED_MARKER = /<span\b[^<>]*>(\{(?:0|[1-9]\d*)\})<\/span>/;
const OUTSIDE_A_WRAPPER = /[<>{}]/;
const COLLAPSIBLE_WHITESPACE = /[\r\n\t]| {2}/;
const ENTITY = /&(?:#(\d+)|#[xX]([0-9A-Fa-f]+)|([A-Za-z]+));/g;
const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
]);
const MAX_CODE_POINT = 0x10ffff;
const SURROGATE_FIRST = 0xd800;
const SURROGATE_LAST = 0xdfff;

function encodeMasked(masked: MaskedValue, wrap: (marker: string) => string): string {
  return masked.text.replace(MARKER_OR_ESCAPED, (match) => ESCAPES[match] ?? wrap(match));
}

export function encodeMaskedForXml(masked: MaskedValue): string {
  return encodeMasked(masked, (marker) => `<x>${marker}</x>`);
}

export function encodeMaskedForHtml(masked: MaskedValue): string | undefined {
  if (COLLAPSIBLE_WHITESPACE.test(masked.text)) {
    return undefined;
  }
  return encodeMasked(masked, (marker) => `<span translate="no">${marker}</span>`);
}

function characterOf(
  decimal: string | undefined,
  hex: string | undefined,
  name: string | undefined,
): string | undefined {
  if (name !== undefined) {
    return NAMED_ENTITIES.get(name);
  }
  const code =
    decimal === undefined ? Number.parseInt(hex ?? "", 16) : Number.parseInt(decimal, 10);
  const valid =
    code > 0 && code <= MAX_CODE_POINT && (code < SURROGATE_FIRST || code > SURROGATE_LAST);
  return valid ? String.fromCodePoint(code) : undefined;
}

function decodeEntities(text: string): string | undefined {
  let known = true;
  const decoded = text.replace(
    ENTITY,
    (_entity, decimal: string | undefined, hex: string | undefined, name: string | undefined) => {
      const character = characterOf(decimal, hex, name);
      if (character === undefined) {
        known = false;
        return "";
      }
      return character;
    },
  );
  const bareAmpersand = text.replace(ENTITY, "").includes("&");
  return known && !bareAmpersand ? decoded : undefined;
}

function decodeResidual(residual: string): string | undefined {
  return OUTSIDE_A_WRAPPER.test(residual) ? undefined : decodeEntities(residual);
}

function decodeWrapped(text: string, wrappedMarker: RegExp): string | undefined {
  const parts = text.split(new RegExp(wrappedMarker.source, "g"));
  let decoded = "";
  for (const [index, part] of parts.entries()) {
    const piece = index % 2 === 1 ? part : decodeResidual(part);
    if (piece === undefined) {
      return undefined;
    }
    decoded += piece;
  }
  return decoded;
}

export function decodeMaskedFromXml(text: string): string | undefined {
  return decodeWrapped(text, XML_WRAPPED_MARKER);
}

export function decodeMaskedFromHtml(text: string): string | undefined {
  return decodeWrapped(text, HTML_WRAPPED_MARKER);
}
