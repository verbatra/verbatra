import { findKeyShapes, matchSpans, type TextSpan } from "@verbatra/ai-providers";
import type { SensitiveDetectorId } from "../config/sensitive-config.js";
import { emailSpans } from "./email.js";
import { ibanSpans } from "./iban.js";

export type { TextSpan } from "@verbatra/ai-providers";

type Detector = (text: string) => readonly TextSpan[];

interface CardBrand {
  readonly prefix: RegExp;
  readonly lengths: readonly number[];
}

const CARD_BRANDS: readonly CardBrand[] = [
  { prefix: /^4/, lengths: [13, 16, 19] },
  { prefix: /^(?:5[1-5]|222[1-9]|22[3-9]\d|2[3-6]\d\d|27[01]\d|2720)/, lengths: [16] },
  { prefix: /^3[47]/, lengths: [15] },
  { prefix: /^(?:6011|65|64[4-9])/, lengths: [16, 17, 18, 19] },
];

const PHONE = /(?<![\w+])\+\d(?:[ .()-]{0,2}\d){6,14}(?!\d)/g;
const CARD = /(?<![\d.-])\d(?:[ -]?\d){12,18}(?![\d.-])/g;
const AWS_KEY = /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g;
const SERVICE_TOKENS: readonly RegExp[] = [
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g,
  /\bgithub_pat_[A-Za-z0-9_]{22,}\b/g,
  /\b[rs]k_live_[A-Za-z0-9]{16,}\b/g,
  /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g,
];
const JWT = /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g;
const PRIVATE_KEY = /-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----/g;
const OCTET = "(?:25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const IPV4 = new RegExp(`(?<![\\w.])(?:${OCTET}\\.){3}${OCTET}(?![\\w.])`, "g");
const HEX = "[0-9A-Fa-f]{1,4}";
const IPV6 = new RegExp(
  `(?<![\\w:])(?:(?:${HEX}:){3,7}${HEX}|(?:${HEX}:){1,6}:(?:${HEX}(?::${HEX}){0,5})?|::${HEX}(?::${HEX}){1,6})(?![\\w:])`,
  "g",
);
const NOT_REPORTED_IP =
  /^(?:127\.|0\.0\.0\.0$|::1$|192\.0\.2\.|198\.51\.100\.|203\.0\.113\.|2001:0{0,3}db8:)/i;
const PRIVATE_IPV4 = /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/;
const PRIVATE_HOST = /(?<![\w.-])(?:[A-Za-z0-9-]+\.)+(?:internal|local|corp)(?![\w-])(?!\.\w)/gi;

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

export function isCardNumber(match: string): boolean {
  const digits = digitsOf(match);
  const brand = CARD_BRANDS.find((candidate) => candidate.prefix.test(digits));
  return brand?.lengths.includes(digits.length) === true && passesLuhn(digits);
}

function phoneDigitsInRange(match: string): boolean {
  const count = digitsOf(match).length;
  return count >= 8 && count <= 15;
}

function isReportedIp(match: string): boolean {
  return !NOT_REPORTED_IP.test(match);
}

function isPrivateIpv4(match: string): boolean {
  return PRIVATE_IPV4.test(match);
}

const DETECTORS: Readonly<Record<SensitiveDetectorId, Detector>> = {
  secret: (text) => [
    ...findKeyShapes(text),
    ...matchSpans(AWS_KEY, text),
    ...SERVICE_TOKENS.flatMap((pattern) => matchSpans(pattern, text)),
    ...matchSpans(JWT, text),
    ...matchSpans(PRIVATE_KEY, text),
  ],
  email: emailSpans,
  iban: ibanSpans,
  "credit-card": (text) => matchSpans(CARD, text, isCardNumber),
  phone: (text) => matchSpans(PHONE, text, phoneDigitsInRange),
  ip: (text) => [...matchSpans(IPV4, text, isReportedIp), ...matchSpans(IPV6, text, isReportedIp)],
  "private-host": (text) => [
    ...matchSpans(PRIVATE_HOST, text),
    ...matchSpans(IPV4, text, isPrivateIpv4),
  ],
};

export function detectorSpans(id: SensitiveDetectorId, text: string): readonly TextSpan[] {
  return DETECTORS[id](text);
}
