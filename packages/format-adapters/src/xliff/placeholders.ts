import { scanTokens } from "../shell.js";

const XLIFF_PATTERN = /<(?:x|g|bx|ex|bpt|ept|ph|it|mrk|pc|sc|ec|sm|em|cp)\b[^>]*>|\{[^{}]+\}/g;

export function extractXliffPlaceholders(value: string): readonly string[] {
  return scanTokens(value, XLIFF_PATTERN);
}
