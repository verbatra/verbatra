import { stripIllegalXmlCharacters } from "./xml-character.js";

export function escapeText(raw: string): string {
  return stripIllegalXmlCharacters(raw)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\r", "&#13;");
}

export function escapeAttribute(raw: string): string {
  return escapeText(raw)
    .replaceAll('"', "&quot;")
    .replaceAll("\n", "&#10;")
    .replaceAll("\t", "&#9;");
}
