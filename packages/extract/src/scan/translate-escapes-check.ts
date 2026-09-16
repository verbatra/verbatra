import { isAssignmentAt, isAttributeName, isIdentNamed, type KeyUsageRules } from "./key-usage.js";
import {
  callOpenIndex,
  identValue,
  isPunct,
  isPunctIn,
  matchingClose,
  matchingOpen,
  tokenAt,
} from "./token-query.js";
import type { SourceToken } from "./tokenize.js";
import { isStatementEnd } from "./translate-arguments.js";
import { DECLARATION_KEYWORDS, TRANSLATE_PATTERN_NAME } from "./translate-bindings.js";
import { lineAt, type SourceState } from "./translate-state.js";

const PROPERTY_PRECEDERS = new Set(["{", ",", "("]);

const PARAMETER_PRECEDERS = new Set(["(", ","]);

const PARAMETER_FOLLOWERS = new Set([")", ",", ":", "=", "?"]);

const FUNCTION_OPENERS = new Set(["function", "async", "return", "default"]);

const FUNCTION_KEYWORD = new Set(["function"]);

const METHOD_PRECEDERS = new Set(["{", "}", ";", ","]);

const METHOD_MODIFIERS = new Set([
  "static",
  "get",
  "set",
  "async",
  "public",
  "private",
  "protected",
  "readonly",
  "override",
  "abstract",
]);

const ARROW_PRECEDERS = new Set(["=", "(", ","]);

const OPENERS = new Set(["(", "[", "{"]);

const CLOSERS = new Set([")", "]", "}"]);

const PATTERN_CONTINUATIONS = new Set([")", ",", ":"]);

const PATTERN_ITEM_TERMINATORS = new Set(["}", ","]);

const CONDITION_KEYWORDS = new Set(["if", "while", "switch", "with"]);

const MARKUP_TAG_ENDS = new Set([";", ">"]);

const PATTERN_ITEM_PRECEDERS = new Set(["{", "[", ","]);

const PATTERN_BINDING_FOLLOWERS = new Set(["}", "]", ",", ":", "="]);

const PATTERN_CLOSERS = new Set(["}", "]"]);

const PROPS_NAME = "props";

const STRAY_QUOTES = new Set(["'", '"']);

function followsStrayQuote(tokens: readonly SourceToken[], index: number): boolean {
  const previous = tokenAt(tokens, index - 1);
  return isPunctIn(previous, STRAY_QUOTES) && previous?.line === tokenAt(tokens, index)?.line;
}

function isPropertyKey(tokens: readonly SourceToken[], index: number): boolean {
  const next = tokenAt(tokens, index + 1);
  const isKeyFollower =
    isPunct(next, ":") || (isPunct(next, "?") && isPunct(tokenAt(tokens, index + 2), ":"));
  return isPunctIn(tokenAt(tokens, index - 1), PROPERTY_PRECEDERS) && isKeyFollower;
}

function isDependencyListItem(
  tokens: readonly SourceToken[],
  index: number,
  rules: KeyUsageRules,
): boolean {
  const closer = matchingClose(tokens, index + 1);
  const opener = closer === undefined ? undefined : matchingOpen(tokens, closer);
  const callClose = closer === undefined ? undefined : closer + 1;
  if (opener === undefined || callClose === undefined || !isPunct(tokenAt(tokens, opener), "[")) {
    return false;
  }
  const callOpen = isPunct(tokenAt(tokens, callClose), ")")
    ? matchingOpen(tokens, callClose)
    : undefined;
  return (
    callOpen !== undefined &&
    isPunct(tokenAt(tokens, opener - 1), ",") &&
    isIdentNamed(tokenAt(tokens, callOpen - 1), rules.dependencyHookNames)
  );
}

function isParameterListOpen(tokens: readonly SourceToken[], opener: number): boolean {
  const before = tokenAt(tokens, opener - 1);
  const beforeName = tokenAt(tokens, opener - 2);
  if (isIdentNamed(before, FUNCTION_OPENERS) || isIdentNamed(beforeName, FUNCTION_KEYWORD)) {
    return true;
  }
  if (before?.kind === "ident") {
    return isPunctIn(beforeName, METHOD_PRECEDERS) || isIdentNamed(beforeName, METHOD_MODIFIERS);
  }
  if (isPunct(before, ">")) {
    return isPunct(beforeName, "=");
  }
  return before === undefined || isPunctIn(before, ARROW_PRECEDERS);
}

function questionMarkAt(tokens: readonly SourceToken[], cursor: number): boolean {
  const isOptionalChain = isPunct(tokenAt(tokens, cursor + 1), ".");
  const isNullish =
    isPunct(tokenAt(tokens, cursor + 1), "?") || isPunct(tokenAt(tokens, cursor - 1), "?");
  return isPunct(tokenAt(tokens, cursor), "?") && !isOptionalChain && !isNullish;
}

function ternaryBalance(tokens: readonly SourceToken[], cursor: number): number {
  if (isPunct(tokenAt(tokens, cursor), ":")) {
    return 1;
  }
  return questionMarkAt(tokens, cursor) ? -1 : 0;
}

function isInsideTernaryBranch(tokens: readonly SourceToken[], opener: number): boolean {
  let depth = 0;
  let colons = 0;
  for (let cursor = opener - 1; cursor >= 0; cursor -= 1) {
    const token = tokenAt(tokens, cursor);
    depth += isPunctIn(token, CLOSERS) ? 1 : 0;
    depth -= isPunctIn(token, OPENERS) ? 1 : 0;
    if (depth < 0 || (depth === 0 && isPunct(token, ";"))) {
      return false;
    }
    colons += depth === 0 ? ternaryBalance(tokens, cursor) : 0;
    if (colons < 0) {
      return true;
    }
  }
  return false;
}

function closesParameters(tokens: readonly SourceToken[], parenClose: number): boolean {
  const next = tokenAt(tokens, parenClose + 1);
  const isArrow = isPunct(next, "=") && isPunct(tokenAt(tokens, parenClose + 2), ">");
  const opener = matchingOpen(tokens, parenClose) ?? 0;
  const isCondition = isIdentNamed(tokenAt(tokens, opener - 1), CONDITION_KEYWORDS);
  if (isArrow || (isPunct(next, "{") && !isCondition)) {
    return true;
  }
  return (
    isPunct(next, ":") &&
    isParameterListOpen(tokens, opener) &&
    !isInsideTernaryBranch(tokens, opener)
  );
}

function isParameter(tokens: readonly SourceToken[], index: number): boolean {
  if (
    !isPunctIn(tokenAt(tokens, index - 1), PARAMETER_PRECEDERS) ||
    !isPunctIn(tokenAt(tokens, index + 1), PARAMETER_FOLLOWERS)
  ) {
    return false;
  }
  const close = matchingClose(tokens, index + 1);
  return (
    close !== undefined && isPunct(tokenAt(tokens, close), ")") && closesParameters(tokens, close)
  );
}

function closesIntoPattern(tokens: readonly SourceToken[], closer: number): boolean {
  const next = tokenAt(tokens, closer + 1);
  if (isAssignmentAt(tokens, closer + 1)) {
    return true;
  }
  const enclosing = isPunctIn(next, PATTERN_CONTINUATIONS)
    ? matchingClose(tokens, closer + 1)
    : undefined;
  return (
    enclosing !== undefined &&
    isPunct(tokenAt(tokens, enclosing), ")") &&
    closesParameters(tokens, enclosing)
  );
}

function isPatternItem(tokens: readonly SourceToken[], index: number): boolean {
  const previous = tokenAt(tokens, index - 1);
  const inItemPosition =
    (isPunctIn(previous, PROPERTY_PRECEDERS) || isPunct(previous, ":")) &&
    isPunctIn(tokenAt(tokens, index + 1), PATTERN_ITEM_TERMINATORS);
  const closer = inItemPosition ? matchingClose(tokens, index + 1) : undefined;
  return (
    closer !== undefined &&
    isPunct(tokenAt(tokens, closer), "}") &&
    closesIntoPattern(tokens, closer)
  );
}

function isTranslationAttribute(
  tokens: readonly SourceToken[],
  index: number,
  rules: KeyUsageRules,
): boolean {
  const isAttribute =
    isPunct(tokenAt(tokens, index - 1), "{") &&
    isPunct(tokenAt(tokens, index - 2), "=") &&
    identValue(tokenAt(tokens, index - 3)) === TRANSLATE_PATTERN_NAME &&
    isPunct(tokenAt(tokens, index + 1), "}");
  if (!isAttribute) {
    return false;
  }
  let depth = 0;
  for (let cursor = index - 4; cursor >= 0; cursor -= 1) {
    const token = tokenAt(tokens, cursor);
    depth += isPunct(token, "}") ? 1 : 0;
    depth -= isPunct(token, "{") ? 1 : 0;
    if (depth === 0 && isPunct(token, "<")) {
      return isIdentNamed(tokenAt(tokens, cursor + 1), rules.translationElements);
    }
    if (depth === 0 && isPunctIn(token, MARKUP_TAG_ENDS)) {
      return false;
    }
  }
  return false;
}

function isAllowedOccurrence(
  tokens: readonly SourceToken[],
  index: number,
  rules: KeyUsageRules,
): boolean {
  return (
    callOpenIndex(tokens, index) !== undefined ||
    isIdentNamed(tokenAt(tokens, index - 1), DECLARATION_KEYWORDS) ||
    isPropertyKey(tokens, index) ||
    isAttributeName(tokens, index) ||
    isParameter(tokens, index) ||
    isPatternItem(tokens, index) ||
    patternAssignmentCloser(tokens, index) !== undefined ||
    isTranslationAttribute(tokens, index, rules) ||
    isDependencyListItem(tokens, index, rules)
  );
}

export function collectEscapes(
  tokens: readonly SourceToken[],
  rules: KeyUsageRules,
  state: SourceState,
): void {
  for (let index = 0; index < tokens.length; index += 1) {
    const isCandidate =
      isIdentNamed(tokenAt(tokens, index), state.identifiers) &&
      !isPunct(tokenAt(tokens, index - 1), ".") &&
      !followsStrayQuote(tokens, index) &&
      !state.allowed.has(index) &&
      !state.imports.has(index);
    if (isCandidate && !isAllowedOccurrence(tokens, index, rules)) {
      state.unresolved.push({ reason: "translate-function-escapes", line: lineAt(tokens, index) });
    }
  }
}

function isThisProps(tokens: readonly SourceToken[], start: number): boolean {
  return (
    identValue(tokenAt(tokens, start)) === "this" &&
    isPunct(tokenAt(tokens, start + 1), ".") &&
    identValue(tokenAt(tokens, start + 2)) === PROPS_NAME &&
    isStatementEnd(tokens, start + 3)
  );
}

function isParameterName(tokens: readonly SourceToken[], name: string): boolean {
  for (let index = 0; index < tokens.length; index += 1) {
    if (identValue(tokenAt(tokens, index)) === name && isParameter(tokens, index)) {
      return true;
    }
  }
  return false;
}

function isParameterInitializer(tokens: readonly SourceToken[], start: number): boolean {
  const name = identValue(tokenAt(tokens, start));
  if (name === undefined) {
    return false;
  }
  if (isThisProps(tokens, start)) {
    return true;
  }
  return isStatementEnd(tokens, start + 1) && isParameterName(tokens, name);
}

function patternAssignmentCloser(
  tokens: readonly SourceToken[],
  index: number,
): number | undefined {
  const inItemPosition =
    isPunctIn(tokenAt(tokens, index - 1), PATTERN_ITEM_PRECEDERS) &&
    isPunctIn(tokenAt(tokens, index + 1), PATTERN_BINDING_FOLLOWERS);
  const closer = inItemPosition ? matchingClose(tokens, index + 1) : undefined;
  const isPattern =
    closer !== undefined &&
    isPunctIn(tokenAt(tokens, closer), PATTERN_CLOSERS) &&
    isAssignmentAt(tokens, closer + 1);
  return isPattern ? closer : undefined;
}

function isUnrecognisedBinding(tokens: readonly SourceToken[], index: number): boolean {
  const isDeclared =
    isIdentNamed(tokenAt(tokens, index - 1), DECLARATION_KEYWORDS) &&
    isAssignmentAt(tokens, index + 1);
  if (isDeclared) {
    return true;
  }
  const closer = patternAssignmentCloser(tokens, index);
  return closer !== undefined && !isParameterInitializer(tokens, closer + 2);
}

export function collectUnrecognisedBindings(
  tokens: readonly SourceToken[],
  rules: KeyUsageRules,
  state: SourceState,
): void {
  for (let index = 0; index < tokens.length; index += 1) {
    const isCandidate =
      isIdentNamed(tokenAt(tokens, index), rules.calleeNames) &&
      !isPunct(tokenAt(tokens, index - 1), ".") &&
      !followsStrayQuote(tokens, index) &&
      !state.allowed.has(index) &&
      !state.imports.has(index);
    if (isCandidate && isUnrecognisedBinding(tokens, index)) {
      state.unresolved.push({
        reason: "unrecognised-translate-source",
        line: lineAt(tokens, index),
      });
    }
  }
}
