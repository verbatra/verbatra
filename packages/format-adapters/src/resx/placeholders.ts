import { scanTokens } from "../shell.js";

const COMPOSITE_FORMAT_ITEM = /\{\{|\}\}|\{\d+(?:,-?\d+)?(?::[^{}]*)?\}/g;

export function extractResxPlaceholders(value: string): readonly string[] {
  return scanTokens(value, COMPOSITE_FORMAT_ITEM, (match) =>
    match[0] === "{{" || match[0] === "}}" ? undefined : match[0],
  );
}
