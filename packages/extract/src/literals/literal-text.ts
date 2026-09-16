export const MAX_LITERAL_TEXT_LENGTH = 80;

const LETTER = /\p{L}/u;

const CHARACTER_REFERENCE = /&(?:[A-Za-z][A-Za-z0-9]*|#[0-9]+|#x[0-9A-Fa-f]+);/g;

const URL_LIKE = /^(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|tel:|data:|www\.)\S*$|^(?:\.{0,2}\/|#)\S*$/i;

const CLASS_TOKEN = /^[a-z0-9:_\-[\]/.!%#@&>=~*()+,]+$/;

const CLASS_MARKER = /[-:[\]/0-9]/;

const DIRECTIVES = new Set(["use client", "use server", "use strict"]);

const NAMED_REFERENCES: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: "\u00a0",
};

const MAX_CODE_POINT = 0x10_ff_ff;

function decodeNumericReference(digits: string): string | undefined {
  const hex = digits.startsWith("x") || digits.startsWith("X");
  const value = Number.parseInt(hex ? digits.slice(1) : digits, hex ? 16 : 10);
  return value > 0 && value <= MAX_CODE_POINT ? String.fromCodePoint(value) : undefined;
}

function decodeReference(reference: string): string {
  const body = reference.slice(1, -1);
  const decoded = body.startsWith("#")
    ? decodeNumericReference(body.slice(1))
    : NAMED_REFERENCES[body];
  return decoded ?? reference;
}

export function decodeCharacterReferences(value: string): string {
  return value.replace(CHARACTER_REFERENCE, decodeReference);
}

export function normalizeLiteralText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function hasLetters(value: string): boolean {
  return LETTER.test(value.replace(CHARACTER_REFERENCE, ""));
}

export function isUrlLike(value: string): boolean {
  return URL_LIKE.test(value.trim());
}

export function isDirective(value: string): boolean {
  return DIRECTIVES.has(value);
}

function isClassListLike(words: readonly string[]): boolean {
  const marked = words.filter((word) => CLASS_MARKER.test(word)).length;
  return words.every((word) => CLASS_TOKEN.test(word)) && marked * 2 >= words.length;
}

export function isProseLike(value: string): boolean {
  const words = normalizeLiteralText(value).split(" ");
  const lettered = words.filter((word) => hasLetters(word)).length;
  return lettered >= 2 && !isClassListLike(words);
}

export interface BoundedText {
  readonly text: string;
  readonly truncated: boolean;
}

export function boundLiteralText(value: string): BoundedText {
  const characters = Array.from(value);
  if (characters.length <= MAX_LITERAL_TEXT_LENGTH) {
    return { text: value, truncated: false };
  }
  return { text: `${characters.slice(0, MAX_LITERAL_TEXT_LENGTH).join("")}...`, truncated: true };
}
