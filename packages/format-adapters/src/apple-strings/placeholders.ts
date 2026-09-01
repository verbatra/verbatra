import { extractPrintfPlaceholders } from "../printf/printf-placeholders.js";

const APPLE_PRINTF_CONVERSIONS = new Set([
  "@",
  "d",
  "i",
  "u",
  "x",
  "X",
  "o",
  "f",
  "e",
  "E",
  "g",
  "G",
  "c",
  "s",
]);

export function extractAppleStringsPlaceholders(value: string): readonly string[] {
  return extractPrintfPlaceholders(value, { conversions: APPLE_PRINTF_CONVERSIONS });
}
