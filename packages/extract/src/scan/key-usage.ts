import type { ReferencedKeySite, UnresolvedKeySite } from "../extractor.js";
import {
  callOpenIndex,
  closeIndex,
  isFollowedBy,
  isPunct,
  isPunctIn,
  tokenAt,
} from "./token-query.js";
import type { SourceToken } from "./tokenize.js";

export interface KeyUsageRules {
  readonly calleeNames: ReadonlySet<string>;
  readonly namespaceSeparator?: string;
  readonly keySeparator?: string;
  readonly fixedTranslateNames: ReadonlySet<string>;
  readonly hookNames: ReadonlySet<string>;
  readonly keyPrefixNames: ReadonlySet<string>;
  readonly keyAttributeNames: ReadonlySet<string>;
  readonly translationElements: ReadonlySet<string>;
  readonly keyedElements: ReadonlySet<string>;
  readonly hocNames: ReadonlySet<string>;
  readonly renderPropElements: ReadonlySet<string>;
  readonly memberTranslateNames: ReadonlySet<string>;
  readonly translateInstanceNames: ReadonlySet<string>;
  readonly translateModules: ReadonlySet<string>;
  readonly dependencyHookNames: ReadonlySet<string>;
}

export interface KeyUsageSites {
  readonly callees: ReadonlySet<string>;
  readonly keyPrefixes: readonly string[];
  readonly references: readonly ReferencedKeySite[];
  readonly unresolved: readonly UnresolvedKeySite[];
}

interface SiteState {
  readonly callees: Set<string>;
  readonly keyPrefixes: Set<string>;
  readonly references: ReferencedKeySite[];
  readonly unresolved: UnresolvedKeySite[];
}

type StaticReading =
  | { readonly kind: "static"; readonly value: string }
  | { readonly kind: "unresolved" };

const UNRESOLVED: StaticReading = { kind: "unresolved" };

const PROPERTY_PRECEDERS = new Set(["{", ","]);

const PROPERTY_TERMINATORS = new Set([",", "}"]);

const ALIAS_TERMINATORS = new Set([",", "}", "="]);

const ASSIGNMENT_FOLLOWERS = new Set(["=", ">"]);

const OPERATOR_CHARACTERS = new Set(["=", "!", "<", "+", "-", "*", "/", "%", "&", "|", "^", "?"]);

const EXPRESSION_ENDS = new Set([";", ",", ")", "}", "]", "|"]);

const ARRAY_ELEMENT_TERMINATORS = new Set([",", "]"]);

const DECLARATION_KEYWORDS = new Set(["const", "let", "var"]);

const MARKUP_PRECEDING_KEYWORDS = new Set(["return", "yield", "await", "default"]);

const VALUE_CLOSERS = new Set([")", "]"]);

const ARGUMENT_OPENERS = new Set(["(", "[", "{"]);

const ARGUMENT_CLOSERS = new Set([")", "]", "}"]);

const ABSENT_PREFIX_NAMES = new Set(["undefined", "null"]);

const TYPE_NAMES = new Set(["string"]);

const IDENTIFIER_START = /^[A-Za-z_$]/;

const BIND = "bind";

const DEFAULT_KEY_SEPARATOR = ".";

export function isIdentNamed(token: SourceToken | undefined, names: ReadonlySet<string>): boolean {
  return token?.kind === "ident" && names.has(token.value);
}

function isNamed(token: SourceToken | undefined, names: ReadonlySet<string>): boolean {
  return (token?.kind === "ident" || token?.kind === "string") && names.has(token.value);
}

function lineOf(tokens: readonly SourceToken[], index: number): number {
  return tokenAt(tokens, index)?.line ?? 0;
}

function namespaceStripped(key: string, rules: KeyUsageRules): string | undefined {
  const separator = rules.namespaceSeparator;
  if (separator === undefined) {
    return undefined;
  }
  const at = key.indexOf(separator);
  return at === -1 ? undefined : key.slice(at + separator.length);
}

export function keyForms(key: string, rules: KeyUsageRules): readonly string[] {
  const stripped = namespaceStripped(key, rules);
  return stripped === undefined || stripped === "" ? [key] : [key, stripped];
}

export function prefixForms(head: string, rules: KeyUsageRules): readonly string[] | undefined {
  const stripped = namespaceStripped(head, rules);
  if (stripped === "") {
    return undefined;
  }
  return stripped === undefined ? [head] : [head, stripped];
}

export function prefixedKey(prefix: string, key: string, rules: KeyUsageRules): string {
  return `${prefix}${rules.keySeparator ?? DEFAULT_KEY_SEPARATOR}${key}`;
}

export function isAssignmentAt(tokens: readonly SourceToken[], index: number): boolean {
  return (
    isPunct(tokenAt(tokens, index), "=") &&
    !isPunctIn(tokenAt(tokens, index + 1), ASSIGNMENT_FOLLOWERS) &&
    !isPunctIn(tokenAt(tokens, index - 1), OPERATOR_CHARACTERS)
  );
}

function isPropertyKey(tokens: readonly SourceToken[], index: number): boolean {
  return (
    isPunctIn(tokenAt(tokens, index - 1), PROPERTY_PRECEDERS) &&
    isPunct(tokenAt(tokens, index + 1), ":")
  );
}

function staticPropertyValue(tokens: readonly SourceToken[], index: number): string | undefined {
  const value = tokenAt(tokens, index + 2);
  return value?.kind === "string" && isFollowedBy(tokens, index + 2, PROPERTY_TERMINATORS)
    ? value.value
    : undefined;
}

function staticAttributeValue(tokens: readonly SourceToken[], index: number): string | undefined {
  const value = tokenAt(tokens, index + 2);
  if (value?.kind === "string") {
    return value.value;
  }
  const inner = tokenAt(tokens, index + 3);
  return isPunct(value, "{") && inner?.kind === "string" && isPunct(tokenAt(tokens, index + 4), "}")
    ? inner.value
    : undefined;
}

export function isAttributeName(tokens: readonly SourceToken[], index: number): boolean {
  const previous = tokenAt(tokens, index - 1);
  const followsMarkup =
    previous?.kind === "string" ||
    isPunct(previous, "}") ||
    (previous?.kind === "ident" && !DECLARATION_KEYWORDS.has(previous.value));
  return (
    tokenAt(tokens, index)?.kind === "ident" && followsMarkup && isAssignmentAt(tokens, index + 1)
  );
}

function closesIntoAssignment(tokens: readonly SourceToken[], index: number): boolean {
  let depth = 0;
  for (let cursor = index; cursor < tokens.length; cursor += 1) {
    const token = tokenAt(tokens, cursor);
    if (isPunct(token, "{")) {
      depth += 1;
    } else if (isPunct(token, "}") && depth === 0) {
      return isAssignmentAt(tokens, cursor + 1);
    } else if (isPunct(token, "}")) {
      depth -= 1;
    }
  }
  return false;
}

function keyPrefixPropertyAt(
  tokens: readonly SourceToken[],
  index: number,
): StaticReading | undefined {
  if (!isPropertyKey(tokens, index)) {
    return undefined;
  }
  const value = staticPropertyValue(tokens, index);
  if (value !== undefined) {
    return { kind: "static", value };
  }
  const isTypeMember = isIdentNamed(tokenAt(tokens, index + 2), TYPE_NAMES);
  return isTypeMember || closesIntoAssignment(tokens, index) ? undefined : UNRESOLVED;
}

function keyPrefixShorthandAt(
  tokens: readonly SourceToken[],
  index: number,
): StaticReading | undefined {
  const isShorthand =
    tokenAt(tokens, index)?.kind === "ident" &&
    isPunctIn(tokenAt(tokens, index - 1), PROPERTY_PRECEDERS) &&
    isPunctIn(tokenAt(tokens, index + 1), PROPERTY_TERMINATORS);
  return isShorthand && !closesIntoAssignment(tokens, index) ? UNRESOLVED : undefined;
}

function keyPrefixAttributeAt(
  tokens: readonly SourceToken[],
  index: number,
): StaticReading | undefined {
  if (!isAttributeName(tokens, index)) {
    return undefined;
  }
  const value = staticAttributeValue(tokens, index);
  return value === undefined ? UNRESOLVED : { kind: "static", value };
}

function keyPrefixOptionAt(
  tokens: readonly SourceToken[],
  index: number,
  rules: KeyUsageRules,
): StaticReading | undefined {
  if (!isNamed(tokenAt(tokens, index), rules.keyPrefixNames)) {
    return undefined;
  }
  return (
    keyPrefixPropertyAt(tokens, index) ??
    keyPrefixShorthandAt(tokens, index) ??
    keyPrefixAttributeAt(tokens, index)
  );
}

function thirdArgument(
  tokens: readonly SourceToken[],
  openIndex: number,
): readonly SourceToken[] | undefined {
  let depth = 0;
  let start = openIndex + 1;
  let position = 0;
  for (let cursor = openIndex; cursor < tokens.length; cursor += 1) {
    const token = tokenAt(tokens, cursor);
    if (isPunctIn(token, ARGUMENT_OPENERS)) {
      depth += 1;
    } else if (isPunctIn(token, ARGUMENT_CLOSERS)) {
      depth -= 1;
    }
    const endsArgument = (depth === 1 && isPunct(token, ",")) || depth === 0;
    if (endsArgument && position === 2) {
      return tokens.slice(start, cursor);
    }
    if (depth === 0) {
      return undefined;
    }
    if (endsArgument) {
      position += 1;
      start = cursor + 1;
    }
  }
  return undefined;
}

function fixedPrefixAt(
  tokens: readonly SourceToken[],
  index: number,
  rules: KeyUsageRules,
): StaticReading | undefined {
  const openIndex = isIdentNamed(tokenAt(tokens, index), rules.fixedTranslateNames)
    ? callOpenIndex(tokens, index)
    : undefined;
  const argument = openIndex === undefined ? undefined : thirdArgument(tokens, openIndex);
  const [only, ...rest] = argument ?? [];
  if (only === undefined || (rest.length === 0 && isIdentNamed(only, ABSENT_PREFIX_NAMES))) {
    return undefined;
  }
  return rest.length === 0 && only.kind === "string"
    ? { kind: "static", value: only.value }
    : UNRESOLVED;
}

function collectKeyPrefix(
  tokens: readonly SourceToken[],
  index: number,
  rules: KeyUsageRules,
  state: SiteState,
): void {
  const reading = keyPrefixOptionAt(tokens, index, rules) ?? fixedPrefixAt(tokens, index, rules);
  if (reading?.kind === "static") {
    state.keyPrefixes.add(reading.value);
  } else if (reading?.kind === "unresolved") {
    state.unresolved.push({ reason: "dynamic-key-prefix", line: lineOf(tokens, index) });
  }
}

export function boundEnd(tokens: readonly SourceToken[], index: number): number {
  const property = tokenAt(tokens, index + 1);
  const isBind =
    isPunct(tokenAt(tokens, index), ".") &&
    property?.kind === "ident" &&
    property.value === BIND &&
    isPunct(tokenAt(tokens, index + 2), "(");
  return isBind ? closeIndex(tokens, index + 2) + 1 : index;
}

function isMemberStep(tokens: readonly SourceToken[], index: number): boolean {
  const property = tokenAt(tokens, index + 2);
  return (
    tokenAt(tokens, index)?.kind === "ident" &&
    isPunct(tokenAt(tokens, index + 1), ".") &&
    property?.kind === "ident" &&
    property.value !== BIND
  );
}

function translateFunctionEnd(
  tokens: readonly SourceToken[],
  start: number,
  rules: KeyUsageRules,
): number | undefined {
  let cursor = start;
  while (isMemberStep(tokens, cursor)) {
    cursor += 2;
  }
  const last = tokenAt(tokens, cursor);
  if (isIdentNamed(last, rules.calleeNames)) {
    return boundEnd(tokens, cursor + 1);
  }
  return isIdentNamed(last, rules.fixedTranslateNames) && isPunct(tokenAt(tokens, cursor + 1), "(")
    ? closeIndex(tokens, cursor + 1) + 1
    : undefined;
}

export function isExpressionEnd(tokens: readonly SourceToken[], index: number): boolean {
  const token = tokenAt(tokens, index);
  const previous = tokenAt(tokens, index - 1);
  if (token === undefined || previous === undefined || token.line > previous.line) {
    return true;
  }
  return (
    isPunctIn(token, EXPRESSION_ENDS) ||
    (isPunct(token, "?") && isPunct(tokenAt(tokens, index + 1), "?"))
  );
}

function assigneeName(tokens: readonly SourceToken[], equalsIndex: number): string | undefined {
  const previous = tokenAt(tokens, equalsIndex - 1);
  const before = tokenAt(tokens, equalsIndex - 2);
  const isPlainName = previous?.kind === "ident" && !isPunct(before, ".") && !isPunct(before, ":");
  return isPlainName ? previous.value : undefined;
}

function collectAssignedAlias(
  tokens: readonly SourceToken[],
  index: number,
  rules: KeyUsageRules,
  state: SiteState,
): void {
  const end = isAssignmentAt(tokens, index)
    ? translateFunctionEnd(tokens, index + 1, rules)
    : undefined;
  if (end === undefined || !isExpressionEnd(tokens, end)) {
    return;
  }
  const name = assigneeName(tokens, index);
  if (name === undefined) {
    state.unresolved.push({ reason: "aliased-translate-function", line: lineOf(tokens, index) });
  } else {
    state.callees.add(name);
  }
}

function destructuredAliasAt(
  tokens: readonly SourceToken[],
  index: number,
  rules: KeyUsageRules,
): string | undefined {
  const alias = tokenAt(tokens, index + 2);
  const isAlias =
    isIdentNamed(tokenAt(tokens, index), rules.calleeNames) &&
    isPropertyKey(tokens, index) &&
    isPunctIn(tokenAt(tokens, index + 3), ALIAS_TERMINATORS);
  return isAlias && alias?.kind === "ident" && IDENTIFIER_START.test(alias.value)
    ? alias.value
    : undefined;
}

function closingBracketIndex(tokens: readonly SourceToken[], openIndex: number): number {
  let depth = 0;
  for (let cursor = openIndex; cursor < tokens.length; cursor += 1) {
    if (isPunct(tokenAt(tokens, cursor), "[")) {
      depth += 1;
    } else if (isPunct(tokenAt(tokens, cursor), "]")) {
      depth -= 1;
      if (depth === 0) {
        return cursor;
      }
    }
  }
  return tokens.length;
}

function arrayAliasAt(
  tokens: readonly SourceToken[],
  index: number,
  rules: KeyUsageRules,
): string | undefined {
  const alias = tokenAt(tokens, index + 1);
  if (
    !isPunct(tokenAt(tokens, index), "[") ||
    alias?.kind !== "ident" ||
    !isPunctIn(tokenAt(tokens, index + 2), ARRAY_ELEMENT_TERMINATORS)
  ) {
    return undefined;
  }
  const close = closingBracketIndex(tokens, index);
  return isAssignmentAt(tokens, close + 1) &&
    isIdentNamed(tokenAt(tokens, close + 2), rules.hookNames)
    ? alias.value
    : undefined;
}

function collectAlias(
  tokens: readonly SourceToken[],
  index: number,
  rules: KeyUsageRules,
  state: SiteState,
): void {
  collectAssignedAlias(tokens, index, rules, state);
  const alias = destructuredAliasAt(tokens, index, rules) ?? arrayAliasAt(tokens, index, rules);
  if (alias !== undefined) {
    state.callees.add(alias);
  }
}

function isKeyedElementStart(
  tokens: readonly SourceToken[],
  index: number,
  rules: KeyUsageRules,
): boolean {
  const name = tokenAt(tokens, index + 1);
  if (
    !isPunct(tokenAt(tokens, index), "<") ||
    !isIdentNamed(name, rules.translationElements) ||
    !isIdentNamed(name, rules.keyedElements)
  ) {
    return false;
  }
  const previous = tokenAt(tokens, index - 1);
  if (previous === undefined) {
    return true;
  }
  if (previous.kind === "ident") {
    return MARKUP_PRECEDING_KEYWORDS.has(previous.value);
  }
  return previous.kind === "punct" && !VALUE_CLOSERS.has(previous.value);
}

function isStaticKeyAttribute(
  tokens: readonly SourceToken[],
  index: number,
  rules: KeyUsageRules,
): boolean {
  return (
    isIdentNamed(tokenAt(tokens, index), rules.keyAttributeNames) &&
    isAssignmentAt(tokens, index + 1) &&
    staticAttributeValue(tokens, index) !== undefined
  );
}

function hasStaticKeyAttribute(
  tokens: readonly SourceToken[],
  index: number,
  rules: KeyUsageRules,
): boolean {
  let depth = 0;
  for (let cursor = index + 2; cursor < tokens.length; cursor += 1) {
    const token = tokenAt(tokens, cursor);
    if (isPunct(token, "{")) {
      depth += 1;
    } else if (isPunct(token, "}")) {
      depth -= 1;
    } else if (depth === 0 && isPunct(token, ">")) {
      return false;
    } else if (depth === 0 && isStaticKeyAttribute(tokens, cursor, rules)) {
      return true;
    }
  }
  return false;
}

function collectKeyedElement(
  tokens: readonly SourceToken[],
  index: number,
  rules: KeyUsageRules,
  state: SiteState,
): void {
  if (isKeyedElementStart(tokens, index, rules) && !hasStaticKeyAttribute(tokens, index, rules)) {
    state.unresolved.push({ reason: "trans-without-key", line: lineOf(tokens, index) });
  }
}

function keyAttributeAt(
  tokens: readonly SourceToken[],
  index: number,
  rules: KeyUsageRules,
): string | undefined {
  const token = tokenAt(tokens, index);
  if (!isNamed(token, rules.keyAttributeNames)) {
    return undefined;
  }
  if (isPropertyKey(tokens, index)) {
    return staticPropertyValue(tokens, index);
  }
  return token?.kind === "ident" && isAssignmentAt(tokens, index + 1)
    ? staticAttributeValue(tokens, index)
    : undefined;
}

function collectKeyAttribute(
  tokens: readonly SourceToken[],
  index: number,
  rules: KeyUsageRules,
  state: SiteState,
): void {
  const key = keyAttributeAt(tokens, index, rules);
  if (key !== undefined && key !== "") {
    const line = lineOf(tokens, index);
    state.references.push(...keyForms(key, rules).map((form) => ({ key: form, line })));
  }
}

export function readKeyUsageSites(
  tokens: readonly SourceToken[],
  rules: KeyUsageRules,
): KeyUsageSites {
  const state: SiteState = {
    callees: new Set(),
    keyPrefixes: new Set(),
    references: [],
    unresolved: [],
  };
  for (let index = 0; index < tokens.length; index += 1) {
    collectAlias(tokens, index, rules, state);
    collectKeyPrefix(tokens, index, rules, state);
    collectKeyedElement(tokens, index, rules, state);
    collectKeyAttribute(tokens, index, rules, state);
  }
  return {
    callees: state.callees,
    keyPrefixes: [...state.keyPrefixes],
    references: state.references,
    unresolved: state.unresolved,
  };
}
