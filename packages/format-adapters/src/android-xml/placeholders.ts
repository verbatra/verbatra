import { extractPrintfPlaceholders } from "../printf/printf-placeholders.js";

const ANDROID_PRINTF_CONVERSIONS = new Set([
  "s",
  "S",
  "d",
  "f",
  "x",
  "X",
  "o",
  "c",
  "C",
  "b",
  "B",
  "e",
  "E",
  "g",
  "G",
]);

export function extractAndroidPlaceholders(value: string): readonly string[] {
  return extractPrintfPlaceholders(value, { conversions: ANDROID_PRINTF_CONVERSIONS });
}
