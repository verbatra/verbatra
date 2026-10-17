import { PLACEHOLDER_ARGUMENT_NAME } from "@verbatra/core";
import { scanTokens } from "../shell.js";

const SINGLE_BRACE_PATTERN = new RegExp(
  `(?<!\\{)\\{\\s*(${PLACEHOLDER_ARGUMENT_NAME})\\s*\\}(?!\\})`,
  "gu",
);

export function extractSingleBraceTokens(value: string): readonly string[] {
  return scanTokens(value, SINGLE_BRACE_PATTERN, (match) => {
    const key = match[1];
    return key !== undefined ? `{${key}}` : undefined;
  });
}
