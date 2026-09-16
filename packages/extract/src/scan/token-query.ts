import type { MarkupToken, SourceToken } from "./tokenize.js";

export const OPENERS: ReadonlySet<string> = new Set(["(", "[", "{"]);

export const CLOSERS: ReadonlySet<string> = new Set([")", "]", "}"]);

export const DECLARATION_KEYWORDS: ReadonlySet<string> = new Set(["const", "let", "var"]);

type QueriedToken = SourceToken | MarkupToken;

export function tokenAt(tokens: readonly SourceToken[], index: number): SourceToken | undefined {
  return tokens[index];
}

export function isPunct(token: QueriedToken | undefined, value: string): boolean {
  return token?.kind === "punct" && token.value === value;
}

export function identValue(token: QueriedToken | undefined): string | undefined {
  return token?.kind === "ident" ? token.value : undefined;
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

export function matchingClose(tokens: readonly SourceToken[], from: number): number | undefined {
  let depth = 0;
  for (let cursor = from; cursor < tokens.length; cursor += 1) {
    const token = tokenAt(tokens, cursor);
    if (isPunctIn(token, OPENERS)) {
      depth += 1;
    } else if (isPunctIn(token, CLOSERS) && depth === 0) {
      return cursor;
    } else if (isPunctIn(token, CLOSERS)) {
      depth -= 1;
    }
  }
  return undefined;
}

export function matchingOpen(
  tokens: readonly SourceToken[],
  closeIndex: number,
): number | undefined {
  let depth = 0;
  for (let cursor = closeIndex - 1; cursor >= 0; cursor -= 1) {
    const token = tokenAt(tokens, cursor);
    if (isPunctIn(token, CLOSERS)) {
      depth += 1;
    } else if (isPunctIn(token, OPENERS) && depth === 0) {
      return cursor;
    } else if (isPunctIn(token, OPENERS)) {
      depth -= 1;
    }
  }
  return undefined;
}

export function listItems(
  tokens: readonly SourceToken[],
  openIndex: number,
  closeIndex: number,
): readonly (readonly number[])[] {
  const items: number[][] = [];
  let current: number[] = [];
  let depth = 0;
  for (let cursor = openIndex + 1; cursor < closeIndex && cursor < tokens.length; cursor += 1) {
    const token = tokenAt(tokens, cursor);
    const closes = isPunctIn(token, CLOSERS);
    if (depth === 0 && isPunct(token, ",")) {
      items.push(current);
      current = [];
    } else {
      current.push(cursor);
    }
    depth += isPunctIn(token, OPENERS) ? 1 : 0;
    depth -= closes ? 1 : 0;
  }
  return current.length > 0 || items.length > 0 ? [...items, current] : [];
}
