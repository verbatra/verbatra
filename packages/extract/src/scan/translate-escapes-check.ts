import { isAssignmentAt, isAttributeName, isIdentNamed, type KeyUsageRules } from "./key-usage.js";
import {
  callOpenIndex,
  isPunct,
  isPunctIn,
  matchingClose,
  matchingOpen,
  tokenAt,
} from "./token-query.js";
import type { SourceToken } from "./tokenize.js";
import { DECLARATION_KEYWORDS, TRANSLATE_PATTERN_NAME } from "./translate-bindings.js";
import { identValue, lineAt, type SourceState } from "./translate-state.js";

const PROPERTY_PRECEDERS = new Set(["{", ",", "("]);

const PARAMETER_PRECEDERS = new Set(["(", ","]);

const PARAMETER_FOLLOWERS = new Set([")", ",", ":", "=", "?"]);

const BLOCK_FOLLOWERS = new Set(["{", ":"]);

const PATTERN_CONTINUATIONS = new Set([")", ",", ":"]);

const PATTERN_ITEM_TERMINATORS = new Set(["}", ","]);

const CONDITION_KEYWORDS = new Set(["if", "while", "switch", "with"]);

const MARKUP_TAG_ENDS = new Set([";", ">"]);

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

function closesParameters(tokens: readonly SourceToken[], parenClose: number): boolean {
  const next = tokenAt(tokens, parenClose + 1);
  const isArrow = isPunct(next, "=") && isPunct(tokenAt(tokens, parenClose + 2), ">");
  const opener = matchingOpen(tokens, parenClose);
  const isCondition = isIdentNamed(tokenAt(tokens, (opener ?? 0) - 1), CONDITION_KEYWORDS);
  return isArrow || (isPunctIn(next, BLOCK_FOLLOWERS) && !isCondition);
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
      !state.allowed.has(index) &&
      !state.imports.has(index);
    if (isCandidate && !isAllowedOccurrence(tokens, index, rules)) {
      state.unresolved.push({ reason: "translate-function-escapes", line: lineAt(tokens, index) });
    }
  }
}
