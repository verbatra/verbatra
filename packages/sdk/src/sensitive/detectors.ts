import { findKeyShapes } from "@verbatra/ai-providers";
import type { SensitiveDetectorId } from "../config/sensitive-config.js";

export interface TextSpan {
  readonly start: number;
  readonly end: number;
}

type Detector = (text: string) => readonly TextSpan[];

const EMAIL = /[A-Za-z0-9._%+-]+@((?:[A-Za-z0-9-]+\.)+[A-Za-z]{2,})(?![A-Za-z0-9-])/g;
const RESERVED_DOMAIN = /(?:^|\.)(?:example\.(?:com|org|net)|example|test|invalid|localhost)$/i;
const PHONE = /(?<![\w+])\+\d(?:[ .()-]{0,2}\d){6,14}(?!\d)/g;
const IBAN = /\b[A-Z]{2}\d{2}(?: ?[A-Z0-9]){11,30}\b/g;
const CARD = /(?<![\d.-])\d(?:[ -]?\d){12,18}(?![\d.-])/g;
const CARD_PREFIX = /^(?:4|5[1-5]|2[2-7]|3[47]|6011|65)/;
const AWS_KEY = /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g;
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const PRIVATE_KEY = /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g;
const OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4 = new RegExp(`(?<![\\w.])(?:${OCTET}\\.){3}${OCTET}(?![\\w.])`, "g");
const HEX = "[0-9A-Fa-f]{1,4}";
const IPV6 = new RegExp(
  `(?<![\\w:])(?:(?:${HEX}:){3,7}${HEX}|(?:${HEX}:){1,6}:(?:${HEX}(?::${HEX}){0,5})?|::${HEX}(?::${HEX}){1,6})(?![\\w:])`,
  "g",
);
const LOOPBACK = /^(?:127\.|0\.0\.0\.0$|::1$)/;
const PRIVATE_IPV4 = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
const PRIVATE_HOST = /(?<![\w.-])(?:[A-Za-z0-9-]+\.)+(?:internal|local|corp)(?![\w-])(?!\.\w)/gi;

function spansOf(pattern: RegExp, text: string, accept?: (match: string) => boolean): TextSpan[] {
  return [...text.matchAll(pattern)]
    .filter((match) => accept === undefined || accept(match[0]))
    .map((match) => ({ start: match.index, end: match.index + match[0].length }));
}

function digitsOf(text: string): string {
  return text.replace(/\D/g, "");
}

export function passesLuhn(digits: string): boolean {
  let sum = 0;
  for (let index = 0; index < digits.length; index += 1) {
    let digit = Number(digits[digits.length - 1 - index]);
    if (index % 2 === 1) {
      digit *= 2;
      digit = digit > 9 ? digit - 9 : digit;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

export function isValidIban(candidate: string): boolean {
  const compact = candidate.replace(/ /g, "");
  if (compact.length < 15 || compact.length > 34) {
    return false;
  }
  const rearranged = `${compact.slice(4)}${compact.slice(0, 4)}`;
  let remainder = 0;
  for (const character of rearranged) {
    const value = Number.parseInt(character, 36);
    remainder = Number(`${remainder}${value}`) % 97;
  }
  return remainder === 1;
}

function ibanSpans(text: string): TextSpan[] {
  const spans: TextSpan[] = [];
  for (const match of text.matchAll(IBAN)) {
    let candidate = match[0];
    while (!isValidIban(candidate) && candidate.includes(" ")) {
      candidate = candidate.slice(0, candidate.lastIndexOf(" "));
    }
    if (isValidIban(candidate)) {
      spans.push({ start: match.index, end: match.index + candidate.length });
    }
  }
  return spans;
}

function isCardNumber(match: string): boolean {
  const digits = digitsOf(match);
  return CARD_PREFIX.test(digits) && passesLuhn(digits);
}

function isPublicEmail(match: string): boolean {
  const domain = match.slice(match.lastIndexOf("@") + 1);
  return !RESERVED_DOMAIN.test(domain);
}

function phoneDigitsInRange(match: string): boolean {
  const count = digitsOf(match).length;
  return count >= 8 && count <= 15;
}

const DETECTORS: Readonly<Record<SensitiveDetectorId, Detector>> = {
  secret: (text) => [
    ...findKeyShapes(text),
    ...spansOf(AWS_KEY, text),
    ...spansOf(JWT, text),
    ...spansOf(PRIVATE_KEY, text),
  ],
  email: (text) => spansOf(EMAIL, text, isPublicEmail),
  iban: ibanSpans,
  "credit-card": (text) => spansOf(CARD, text, isCardNumber),
  phone: (text) => spansOf(PHONE, text, phoneDigitsInRange),
  ip: (text) => [
    ...spansOf(IPV4, text, (match) => !LOOPBACK.test(match)),
    ...spansOf(IPV6, text, (match) => !LOOPBACK.test(match)),
  ],
  "private-host": (text) => [
    ...spansOf(PRIVATE_HOST, text),
    ...spansOf(IPV4, text, (match) => PRIVATE_IPV4.test(match)),
  ],
};

export function detectorSpans(id: SensitiveDetectorId, text: string): readonly TextSpan[] {
  return DETECTORS[id](text);
}

export function patternSpans(pattern: RegExp, text: string): readonly TextSpan[] {
  return [...text.matchAll(pattern)]
    .filter((match) => match[0].length > 0)
    .map((match) => ({ start: match.index, end: match.index + match[0].length }));
}
