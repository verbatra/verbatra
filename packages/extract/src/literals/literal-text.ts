export const MAX_LITERAL_TEXT_LENGTH = 80;

const LETTER = /\p{L}/u;

const CHARACTER_REFERENCE = /&(?:[A-Za-z][A-Za-z0-9]*|#[0-9]+|#x[0-9A-Fa-f]+);/g;

const URL_LIKE = /^(?:[a-z][a-z0-9+.-]*:\/\/|mailto:|tel:|data:|www\.)\S*$|^(?:\.{0,2}\/|#)\S*$/i;

const CLASS_TOKEN = /^[a-z0-9:_\-[\]/.!%#@&>=~*()+,]+$/;

const CLASS_MARKER = /[-:[\]/0-9]/;

const DIRECTIVES = new Set(["use client", "use server", "use strict"]);

const NAMED_REFERENCES: ReadonlyMap<string, string> = new Map(
  Object.entries({
    Aacute: "\u00c1",
    aacute: "\u00e1",
    Acirc: "\u00c2",
    acirc: "\u00e2",
    Agrave: "\u00c0",
    agrave: "\u00e0",
    amp: "&",
    apos: "'",
    Auml: "\u00c4",
    auml: "\u00e4",
    bdquo: "\u201e",
    bull: "\u2022",
    Ccedil: "\u00c7",
    ccedil: "\u00e7",
    cent: "\u00a2",
    copy: "\u00a9",
    deg: "\u00b0",
    divide: "\u00f7",
    Eacute: "\u00c9",
    eacute: "\u00e9",
    Ecirc: "\u00ca",
    ecirc: "\u00ea",
    Egrave: "\u00c8",
    egrave: "\u00e8",
    euro: "\u20ac",
    frac12: "\u00bd",
    frac14: "\u00bc",
    frac34: "\u00be",
    gt: ">",
    hellip: "\u2026",
    iacute: "\u00ed",
    icirc: "\u00ee",
    iexcl: "\u00a1",
    iquest: "\u00bf",
    laquo: "\u00ab",
    ldquo: "\u201c",
    lsquo: "\u2018",
    lt: "<",
    mdash: "\u2014",
    middot: "\u00b7",
    nbsp: "\u00a0",
    ndash: "\u2013",
    Ntilde: "\u00d1",
    ntilde: "\u00f1",
    Oacute: "\u00d3",
    oacute: "\u00f3",
    ocirc: "\u00f4",
    Ouml: "\u00d6",
    ouml: "\u00f6",
    para: "\u00b6",
    plusmn: "\u00b1",
    pound: "\u00a3",
    quot: '"',
    raquo: "\u00bb",
    rdquo: "\u201d",
    reg: "\u00ae",
    rsquo: "\u2019",
    sbquo: "\u201a",
    sect: "\u00a7",
    shy: "\u00ad",
    szlig: "\u00df",
    times: "\u00d7",
    trade: "\u2122",
    uacute: "\u00fa",
    ucirc: "\u00fb",
    ugrave: "\u00f9",
    Uuml: "\u00dc",
    uuml: "\u00fc",
    yen: "\u00a5",
  }),
);

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
    : NAMED_REFERENCES.get(body);
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
