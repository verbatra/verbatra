import type { SourceToken } from "./tokenize.js";

export function tokenAt(tokens: readonly SourceToken[], index: number): SourceToken | undefined {
  return tokens[index];
}

export function isPunct(token: SourceToken | undefined, value: string): boolean {
  return token?.kind === "punct" && token.value === value;
}

export function isPunctIn(token: SourceToken | undefined, values: ReadonlySet<string>): boolean {
  return token?.kind === "punct" && values.has(token.value);
}

export function isFollowedBy(
  tokens: readonly SourceToken[],
  index: number,
  terminators: ReadonlySet<string>,
): boolean {
  const next = tokenAt(tokens, index + 1);
  return next === undefined || isPunctIn(next, terminators);
}

function skipTypeArguments(tokens: readonly SourceToken[], index: number): number | undefined {
  let depth = 0;
  for (let cursor = index; cursor < tokens.length; cursor += 1) {
    if (isPunct(tokenAt(tokens, cursor), "<")) {
      depth += 1;
    } else if (isPunct(tokenAt(tokens, cursor), ">")) {
      depth -= 1;
      if (depth === 0) {
        return cursor + 1;
      }
    }
  }
  return undefined;
}

export function callOpenIndex(tokens: readonly SourceToken[], index: number): number | undefined {
  let cursor = index + 1;
  if (isPunct(tokenAt(tokens, cursor), "?") && isPunct(tokenAt(tokens, cursor + 1), ".")) {
    cursor += 2;
  }
  if (isPunct(tokenAt(tokens, cursor), "<")) {
    const afterTypeArguments = skipTypeArguments(tokens, cursor);
    if (afterTypeArguments === undefined) {
      return undefined;
    }
    cursor = afterTypeArguments;
  }
  return isPunct(tokenAt(tokens, cursor), "(") ? cursor : undefined;
}

export function closeIndex(tokens: readonly SourceToken[], openIndex: number): number {
  let depth = 0;
  for (let cursor = openIndex; cursor < tokens.length; cursor += 1) {
    if (isPunct(tokenAt(tokens, cursor), "(")) {
      depth += 1;
    } else if (isPunct(tokenAt(tokens, cursor), ")")) {
      depth -= 1;
      if (depth === 0) {
        return cursor;
      }
    }
  }
  return tokens.length;
}
