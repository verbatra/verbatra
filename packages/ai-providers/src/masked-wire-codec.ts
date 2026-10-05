import type { MaskedValue } from "./placeholder-protection.js";

const MARKER_OR_ESCAPED = /\{(?:0|[1-9]\d*)\}|[&<>]/g;
const ESCAPES: Readonly<Record<string, string>> = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const XML_WRAPPED_MARKER = /<x>(\{(?:0|[1-9]\d*)\})<\/x>/;
const HTML_WRAPPED_MARKER = /<span(?:\s[^<>&{}]*)?>(\{(?:0|[1-9]\d*)\})<\/span>/;
const RESERVED_IN_DECODED_TEXT = /[<>{}]/;
const COLLAPSIBLE_WHITESPACE = /[\r\n\t]| {2}/;
const ENTITY = /&(#[xX]?)?([0-9A-Za-z]+);/g;
const DECIMAL_DIGITS = /^\d+$/;
const HEX_DIGITS = /^[0-9A-Fa-f]+$/;
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

function characterOf(prefix: string | undefined, body: string): string | undefined {
  if (prefix === undefined) {
    return NAMED_ENTITIES.get(body);
  }
  const decimal = prefix === "#";
  if (!(decimal ? DECIMAL_DIGITS : HEX_DIGITS).test(body)) {
    return undefined;
  }
  const code = Number.parseInt(body, decimal ? 10 : 16);
  const valid =
    code > 0 && code <= MAX_CODE_POINT && (code < SURROGATE_FIRST || code > SURROGATE_LAST);
  return valid ? String.fromCodePoint(code) : undefined;
}

function decodeEntities(text: string): string | undefined {
  let known = true;
  const decoded = text.replace(ENTITY, (_entity, prefix: string | undefined, body: string) => {
    const character = characterOf(prefix, body);
    if (character === undefined) {
      known = false;
      return "";
    }
    return character;
  });
  const bareAmpersand = text.replace(ENTITY, "").includes("&");
  return known && !bareAmpersand ? decoded : undefined;
}

function decodeResidual(residual: string): string | undefined {
  const decoded = decodeEntities(residual);
  return decoded === undefined || RESERVED_IN_DECODED_TEXT.test(decoded) ? undefined : decoded;
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
