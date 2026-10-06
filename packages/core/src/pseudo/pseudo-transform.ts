import { protectedMask, protectedRuns } from "../placeholder/protected-runs.js";

const ACCENTS: Readonly<Record<string, string>> = {
  a: "á",
  b: "ḃ",
  c: "ć",
  d: "ḋ",
  e: "é",
  f: "ƒ",
  g: "ġ",
  h: "ĥ",
  i: "í",
  j: "ĵ",
  k: "ǩ",
  l: "ĺ",
  m: "ṁ",
  n: "ń",
  o: "ó",
  p: "ṗ",
  q: "ɋ",
  r: "ŕ",
  s: "ś",
  t: "ṫ",
  u: "ú",
  v: "ṽ",
  w: "ẃ",
  x: "ẋ",
  y: "ý",
  z: "ż",
  A: "Á",
  B: "Ḃ",
  C: "Ć",
  D: "Ḋ",
  E: "É",
  F: "Ƒ",
  G: "Ġ",
  H: "Ĥ",
  I: "Í",
  J: "Ĵ",
  K: "Ǩ",
  L: "Ĺ",
  M: "Ṁ",
  N: "Ń",
  O: "Ó",
  P: "Ṗ",
  Q: "Ɋ",
  R: "Ŕ",
  S: "Ś",
  T: "Ṫ",
  U: "Ú",
  V: "Ṽ",
  W: "Ẃ",
  X: "Ẋ",
  Y: "Ý",
  Z: "Ż",
};

const EXPANSION_RATIO = 0.35;

const FILLER = "·";

const OPEN_MARKER = "[";

const CLOSE_MARKER = "]";

const COMBINING_MARK = /\p{M}/u;

const TRAILING_SURROGATE_FIRST = 0xdc00;

const TRAILING_SURROGATE_LAST = 0xdfff;

function countsTowardExpansion(char: string, code: number): boolean {
  if (code >= TRAILING_SURROGATE_FIRST && code <= TRAILING_SURROGATE_LAST) {
    return false;
  }
  return !COMBINING_MARK.test(char);
}

export function pseudolocalizeValue(value: string): string {
  if (value === "") {
    return "";
  }
  const mask = protectedMask(value);
  let body = "";
  let translatable = 0;
  for (let i = 0; i < value.length; i += 1) {
    const char = value.charAt(i);
    if (mask[i] === 1) {
      body += char;
      continue;
    }
    if (countsTowardExpansion(char, value.charCodeAt(i))) {
      translatable += 1;
    }
    body += ACCENTS[char] ?? char;
  }
  const padding = FILLER.repeat(Math.ceil(translatable * EXPANSION_RATIO));
  return `${OPEN_MARKER}${body}${padding}${CLOSE_MARKER}`;
}

const RIGHT_TO_LEFT_MARK = "\u200f";

const RIGHT_TO_LEFT_OVERRIDE = "\u202e";

const POP_DIRECTIONAL_FORMATTING = "\u202c";

const WORD = /[\p{L}\p{M}]+/gu;

function overrideWords(text: string): string {
  return text.replace(
    WORD,
    (word) =>
      `${RIGHT_TO_LEFT_MARK}${RIGHT_TO_LEFT_OVERRIDE}${word}${POP_DIRECTIONAL_FORMATTING}${RIGHT_TO_LEFT_MARK}`,
  );
}

export function pseudolocalizeBidiValue(value: string): string {
  return protectedRuns(value)
    .map((run) => (run.protected ? run.text : overrideWords(run.text)))
    .join("");
}
