import type { TextSpan } from "@verbatra/ai-providers";

const IBAN_LENGTHS: Readonly<Record<string, number>> = {
  AD: 24,
  AE: 23,
  AL: 28,
  AT: 20,
  AZ: 28,
  BA: 20,
  BE: 16,
  BG: 22,
  BH: 22,
  BI: 27,
  BR: 29,
  BY: 28,
  CH: 21,
  CR: 22,
  CY: 28,
  CZ: 24,
  DE: 22,
  DJ: 27,
  DK: 18,
  DO: 28,
  EE: 20,
  EG: 29,
  ES: 24,
  FI: 18,
  FK: 18,
  FO: 18,
  FR: 27,
  GB: 22,
  GE: 22,
  GI: 23,
  GL: 18,
  GR: 27,
  GT: 28,
  HR: 21,
  HU: 28,
  IE: 22,
  IL: 23,
  IQ: 23,
  IS: 26,
  IT: 27,
  JO: 30,
  KW: 30,
  KZ: 20,
  LB: 28,
  LC: 32,
  LI: 21,
  LT: 20,
  LU: 20,
  LV: 21,
  LY: 25,
  MC: 27,
  MD: 24,
  ME: 22,
  MK: 19,
  MN: 20,
  MR: 27,
  MT: 31,
  MU: 30,
  NI: 28,
  NL: 18,
  NO: 15,
  OM: 23,
  PK: 24,
  PL: 28,
  PS: 29,
  PT: 25,
  QA: 29,
  RO: 24,
  RS: 22,
  RU: 33,
  SA: 24,
  SC: 31,
  SD: 18,
  SE: 24,
  SI: 19,
  SK: 24,
  SM: 27,
  SO: 23,
  ST: 25,
  SV: 28,
  TL: 23,
  TN: 24,
  TR: 26,
  UA: 29,
  VA: 22,
  VG: 24,
  XK: 20,
  YE: 30,
};

const IBAN_START = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}/g;
const ALPHANUMERIC = /[A-Za-z0-9]/;

export function isValidIban(candidate: string): boolean {
  const compact = candidate.replace(/ /g, "");
  if (IBAN_LENGTHS[compact.slice(0, 2)] !== compact.length) {
    return false;
  }
  const rearranged = `${compact.slice(4)}${compact.slice(0, 4)}`;
  let remainder = 0;
  for (const character of rearranged) {
    remainder = Number(`${remainder}${Number.parseInt(character, 36)}`) % 97;
  }
  return remainder === 1;
}

function endOfLength(text: string, start: number, length: number): number | undefined {
  let counted = 0;
  let index = start;
  while (index < text.length && counted < length) {
    if (text.charAt(index) !== " ") {
      counted += 1;
    }
    index += 1;
  }
  return counted === length ? index : undefined;
}

export function ibanSpans(text: string): TextSpan[] {
  const spans: TextSpan[] = [];
  for (const match of text.matchAll(IBAN_START)) {
    const length = IBAN_LENGTHS[match[0].slice(0, 2)];
    const end = length === undefined ? undefined : endOfLength(text, match.index, length);
    if (
      end !== undefined &&
      !ALPHANUMERIC.test(text.charAt(end)) &&
      isValidIban(text.slice(match.index, end))
    ) {
      spans.push({ start: match.index, end });
    }
  }
  return spans;
}
