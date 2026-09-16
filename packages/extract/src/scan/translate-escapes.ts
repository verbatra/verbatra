import type { UnresolvedKeySite } from "../extractor.js";
import { boundEnd, isAssignmentAt, isExpressionEnd, isIdentNamed } from "./key-usage.js";
import { callOpenIndex, isPunct, isPunctIn, tokenAt } from "./token-query.js";
import type { SourceToken } from "./tokenize.js";

const OPENERS = new Set(["(", "[", "{"]);

const CLOSERS = new Set([")", "]", "}"]);

const LIST_OPENERS = new Set(["(", "[", "{", ","]);

const LIST_CLOSERS = new Set([")", "]", "}", ","]);

const PROPERTY_PRECEDERS = new Set(["{", ","]);

const PARAMETER_FOLLOWERS = new Set(["{", ":"]);

const PATTERN_CONTINUATIONS = new Set([")", ",", ":"]);

const CALLEE_ENDS = new Set([")", "]", ">"]);

const NON_CALL_KEYWORDS = new Set([
  "if",
  "while",
  "for",
  "switch",
  "catch",
  "function",
  "return",
  "typeof",
  "await",
  "with",
]);

const RETURN_KEYWORDS = new Set(["return", "yield"]);

function matchingClose(tokens: readonly SourceToken[], from: number): number | undefined {
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

function matchingOpen(tokens: readonly SourceToken[], closeIndex: number): number | undefined {
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

function closesParameters(tokens: readonly SourceToken[], parenClose: number): boolean {
  const next = tokenAt(tokens, parenClose + 1);
  const isArrow = isPunct(next, "=") && isPunct(tokenAt(tokens, parenClose + 2), ">");
  return isArrow || isPunctIn(next, PARAMETER_FOLLOWERS);
}

function closesIntoPattern(tokens: readonly SourceToken[], closeIndex: number): boolean {
  const next = tokenAt(tokens, closeIndex + 1);
  if (isAssignmentAt(tokens, closeIndex + 1) || (next?.kind === "ident" && next.value === "from")) {
    return true;
  }
  if (!isPunctIn(next, PATTERN_CONTINUATIONS)) {
    return false;
  }
  const enclosing = matchingClose(tokens, closeIndex + 1);
  return (
    enclosing !== undefined &&
    isPunct(tokenAt(tokens, enclosing), ")") &&
    closesParameters(tokens, enclosing)
  );
}

function isCallOpen(tokens: readonly SourceToken[], openIndex: number | undefined): boolean {
  if (openIndex === undefined || !isPunct(tokenAt(tokens, openIndex), "(")) {
    return false;
  }
  const before = tokenAt(tokens, openIndex - 1);
  if (before?.kind === "ident") {
    return !NON_CALL_KEYWORDS.has(before.value);
  }
  return isPunctIn(before, CALLEE_ENDS);
}

function isListEscape(tokens: readonly SourceToken[], end: number): boolean {
  const close = matchingClose(tokens, end);
  if (close === undefined) {
    return false;
  }
  if (isPunct(tokenAt(tokens, close), ")")) {
    return !closesParameters(tokens, close) && isCallOpen(tokens, matchingOpen(tokens, close));
  }
  return !closesIntoPattern(tokens, close);
}

function isPropertyValue(tokens: readonly SourceToken[], start: number, end: number): boolean {
  const key = tokenAt(tokens, start - 2);
  return (
    isPunct(tokenAt(tokens, start - 1), ":") &&
    (key?.kind === "ident" || key?.kind === "string") &&
    isPunctIn(tokenAt(tokens, start - 3), PROPERTY_PRECEDERS) &&
    isPunctIn(tokenAt(tokens, end), new Set([",", "}"]))
  );
}

function isArrowBody(tokens: readonly SourceToken[], start: number, end: number): boolean {
  return (
    isPunct(tokenAt(tokens, start - 1), ">") &&
    isPunct(tokenAt(tokens, start - 2), "=") &&
    isExpressionEnd(tokens, end)
  );
}

function isEscape(tokens: readonly SourceToken[], start: number, end: number): boolean {
  if (
    isIdentNamed(tokenAt(tokens, start - 1), RETURN_KEYWORDS) ||
    isArrowBody(tokens, start, end)
  ) {
    return true;
  }
  if (isPropertyValue(tokens, start, end)) {
    return !closesIntoPattern(tokens, matchingClose(tokens, end) ?? tokens.length);
  }
  const isListItem =
    isPunctIn(tokenAt(tokens, start - 1), LIST_OPENERS) &&
    isPunctIn(tokenAt(tokens, end), LIST_CLOSERS);
  return isListItem && isListEscape(tokens, end);
}

function referenceStart(tokens: readonly SourceToken[], index: number): number {
  let start = index;
  while (isPunct(tokenAt(tokens, start - 1), ".") && tokenAt(tokens, start - 2)?.kind === "ident") {
    start -= 2;
  }
  return start;
}

function referenceEnd(tokens: readonly SourceToken[], index: number): number | undefined {
  if (callOpenIndex(tokens, index) !== undefined) {
    return undefined;
  }
  const end = boundEnd(tokens, index + 1);
  const isMemberRead = end === index + 1 && isPunct(tokenAt(tokens, end), ".");
  return isMemberRead || isPunct(tokenAt(tokens, end), ":") ? undefined : end;
}

export function findTranslateEscapes(
  tokens: readonly SourceToken[],
  callees: ReadonlySet<string>,
): readonly UnresolvedKeySite[] {
  const escapes: UnresolvedKeySite[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokenAt(tokens, index);
    const end = isIdentNamed(token, callees) ? referenceEnd(tokens, index) : undefined;
    if (
      token !== undefined &&
      end !== undefined &&
      isEscape(tokens, referenceStart(tokens, index), end)
    ) {
      escapes.push({ reason: "translate-function-escapes", line: token.line });
    }
  }
  return escapes;
}
