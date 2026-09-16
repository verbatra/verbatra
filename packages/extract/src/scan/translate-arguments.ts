import { isIdentNamed, type KeyUsageRules } from "./key-usage.js";
import {
  callOpenIndex,
  closeIndex,
  isPunct,
  isPunctIn,
  listItems,
  matchingClose,
  tokenAt,
} from "./token-query.js";
import type { SourceToken } from "./tokenize.js";

const ABSENT_ARGUMENT_NAMES = new Set(["null", "undefined"]);

export const STATEMENT_ENDS = new Set([";", "}"]);

export function isStatementEnd(tokens: readonly SourceToken[], index: number): boolean {
  const token = tokenAt(tokens, index);
  const previous = tokenAt(tokens, index - 1);
  return (
    token === undefined ||
    previous === undefined ||
    token.line > previous.line ||
    isPunctIn(token, STATEMENT_ENDS)
  );
}

function isStringList(tokens: readonly SourceToken[], indices: readonly number[]): boolean {
  const first = indices[0];
  const last = indices[indices.length - 1];
  if (first === undefined || last === undefined || !isPunct(tokenAt(tokens, first), "[")) {
    return false;
  }
  if (matchingClose(tokens, first + 1) !== last) {
    return false;
  }
  return listItems(tokens, first, last).every(
    (item) => item.length === 1 && tokenAt(tokens, item[0] ?? -1)?.kind === "string",
  );
}

export function isStaticNamespace(
  tokens: readonly SourceToken[],
  indices: readonly number[],
): boolean {
  const only = indices.length === 1 ? tokenAt(tokens, indices[0] ?? -1) : undefined;
  return only?.kind === "string" || isStringList(tokens, indices);
}

export function isStaticFixedArgument(
  tokens: readonly SourceToken[],
  indices: readonly number[],
): boolean {
  const only = indices.length === 1 ? tokenAt(tokens, indices[0] ?? -1) : undefined;
  return isIdentNamed(only, ABSENT_ARGUMENT_NAMES) || isStaticNamespace(tokens, indices);
}

function isStaticOptionItem(
  tokens: readonly SourceToken[],
  item: readonly number[],
  rules: KeyUsageRules,
): boolean {
  const [keyIndex, colonIndex, ...value] = item;
  const key = tokenAt(tokens, keyIndex ?? -1);
  const isKey = key?.kind === "ident" || key?.kind === "string";
  if (!isKey || !isPunct(tokenAt(tokens, colonIndex ?? -1), ":")) {
    return false;
  }
  const isPrefix = rules.keyPrefixNames.has(key.value);
  return !isPrefix || (value.length === 1 && tokenAt(tokens, value[0] ?? -1)?.kind === "string");
}

export function isStaticOptions(
  tokens: readonly SourceToken[],
  indices: readonly number[],
  rules: KeyUsageRules,
): boolean {
  const first = indices[0];
  const last = indices[indices.length - 1];
  if (first === undefined || last === undefined || !isPunct(tokenAt(tokens, first), "{")) {
    return false;
  }
  if (matchingClose(tokens, first + 1) !== last) {
    return false;
  }
  return listItems(tokens, first, last)
    .filter((item) => item.length > 0)
    .every((item) => isStaticOptionItem(tokens, item, rules));
}

export function callArguments(
  tokens: readonly SourceToken[],
  index: number,
): { readonly items: readonly (readonly number[])[]; readonly close: number } | undefined {
  const open = callOpenIndex(tokens, index);
  if (open === undefined || !isPunct(tokenAt(tokens, open), "(")) {
    return undefined;
  }
  const close = closeIndex(tokens, open);
  return close >= tokens.length ? undefined : { items: listItems(tokens, open, close), close };
}

export function referenceStart(tokens: readonly SourceToken[], index: number): number {
  let start = index;
  while (isPunct(tokenAt(tokens, start - 1), ".") && tokenAt(tokens, start - 2)?.kind === "ident") {
    start -= 2;
  }
  return start;
}
