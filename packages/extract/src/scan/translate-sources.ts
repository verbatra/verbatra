import type { UnresolvedKeySite } from "../extractor.js";
import {
  boundEnd,
  isAssignmentAt,
  isAttributeName,
  isIdentNamed,
  type KeyUsageRules,
} from "./key-usage.js";
import {
  callOpenIndex,
  closeIndex,
  isPunct,
  isPunctIn,
  listItems,
  matchingClose,
  matchingOpen,
  tokenAt,
} from "./token-query.js";
import type { SourceToken } from "./tokenize.js";

export interface TranslateSources {
  readonly identifiers: ReadonlySet<string>;
  readonly unresolved: readonly UnresolvedKeySite[];
}

interface Binding {
  readonly names: readonly string[];
  readonly indices: readonly number[];
}

interface SourceState {
  readonly identifiers: Set<string>;
  readonly allowed: Set<number>;
  readonly imports: Set<number>;
  readonly unresolved: UnresolvedKeySite[];
}

const DECLARATION_KEYWORDS = new Set(["const", "let", "var"]);

const HOOK_PATTERN_NAMES = new Set(["t", "i18n", "ready"]);

const TRANSLATE_PATTERN_NAME = "t";

const ABSENT_ARGUMENT_NAMES = new Set(["null", "undefined"]);

const STATEMENT_ENDS = new Set([";", "}"]);

const PROPERTY_PRECEDERS = new Set(["{", ",", "("]);

const PARAMETER_PRECEDERS = new Set(["(", ","]);

const PARAMETER_FOLLOWERS = new Set([")", ",", ":", "=", "?"]);

const BLOCK_FOLLOWERS = new Set(["{", ":"]);

const PATTERN_CONTINUATIONS = new Set([")", ",", ":"]);

const PATTERN_ITEM_TERMINATORS = new Set(["}", ","]);

const CONDITION_KEYWORDS = new Set(["if", "while", "switch", "with"]);

const MARKUP_TAG_ENDS = new Set([";", ">"]);

function lineAt(tokens: readonly SourceToken[], index: number): number {
  return tokenAt(tokens, index)?.line ?? 0;
}

function identValue(token: SourceToken | undefined): string | undefined {
  return token?.kind === "ident" ? token.value : undefined;
}

function isStatementEnd(tokens: readonly SourceToken[], index: number): boolean {
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

function isStaticNamespace(tokens: readonly SourceToken[], indices: readonly number[]): boolean {
  const only = indices.length === 1 ? tokenAt(tokens, indices[0] ?? -1) : undefined;
  return only?.kind === "string" || isStringList(tokens, indices);
}

function isStaticFixedArgument(
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

function isStaticOptions(
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

function declaredNameIndex(tokens: readonly SourceToken[], valueStart: number): number | undefined {
  const nameIndex = valueStart - 2;
  const isDeclared =
    isAssignmentAt(tokens, valueStart - 1) &&
    tokenAt(tokens, nameIndex)?.kind === "ident" &&
    isIdentNamed(tokenAt(tokens, nameIndex - 1), DECLARATION_KEYWORDS) &&
    identValue(tokenAt(tokens, nameIndex - 2)) !== "export";
  return isDeclared ? nameIndex : undefined;
}

function nameBinding(
  tokens: readonly SourceToken[],
  index: number | undefined,
): Binding | undefined {
  const name = index === undefined ? undefined : identValue(tokenAt(tokens, index));
  return index === undefined || name === undefined
    ? undefined
    : { names: [name], indices: [index] };
}

function hookPatternItem(
  tokens: readonly SourceToken[],
  item: readonly number[],
): Binding | undefined {
  const [nameIndex, colonIndex, aliasIndex] = item;
  const name = identValue(tokenAt(tokens, nameIndex ?? -1));
  const alias = identValue(tokenAt(tokens, aliasIndex ?? -1));
  if (name === undefined || nameIndex === undefined || !HOOK_PATTERN_NAMES.has(name)) {
    return undefined;
  }
  const isRenamed =
    item.length === 3 && isPunct(tokenAt(tokens, colonIndex ?? -1), ":") && alias !== undefined;
  if (item.length !== 1 && !isRenamed) {
    return undefined;
  }
  const bound = isRenamed && alias !== undefined ? alias : name;
  return {
    names: name === TRANSLATE_PATTERN_NAME ? [bound] : [],
    indices: isRenamed && aliasIndex !== undefined ? [nameIndex, aliasIndex] : [nameIndex],
  };
}

function objectPatternBinding(
  tokens: readonly SourceToken[],
  items: readonly (readonly number[])[],
): Binding | undefined {
  const bindings = items.map((item) => hookPatternItem(tokens, item));
  if (bindings.some((binding) => binding === undefined)) {
    return undefined;
  }
  return {
    names: bindings.flatMap((binding) => binding?.names ?? []),
    indices: bindings.flatMap((binding) => binding?.indices ?? []),
  };
}

function arrayPatternBinding(
  tokens: readonly SourceToken[],
  items: readonly (readonly number[])[],
): Binding | undefined {
  const isPlain = items.every(
    (item) => item.length === 1 && tokenAt(tokens, item[0] ?? -1)?.kind === "ident",
  );
  const first = items[0]?.[0];
  const name = identValue(tokenAt(tokens, first ?? -1));
  return isPlain && first !== undefined && name !== undefined
    ? { names: [name], indices: items.flat() }
    : undefined;
}

function declaredPattern(tokens: readonly SourceToken[], valueStart: number): Binding | undefined {
  const closer = valueStart - 2;
  const opener = matchingOpen(tokens, closer);
  const isDeclared =
    isAssignmentAt(tokens, valueStart - 1) &&
    opener !== undefined &&
    isIdentNamed(tokenAt(tokens, opener - 1), DECLARATION_KEYWORDS) &&
    identValue(tokenAt(tokens, opener - 2)) !== "export";
  if (!isDeclared) {
    return undefined;
  }
  const items = listItems(tokens, opener, closer);
  if (isPunct(tokenAt(tokens, opener), "{")) {
    return objectPatternBinding(tokens, items);
  }
  return isPunct(tokenAt(tokens, opener), "[") ? arrayPatternBinding(tokens, items) : undefined;
}

function callArguments(
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

function hookBinding(
  tokens: readonly SourceToken[],
  index: number,
  rules: KeyUsageRules,
): Binding | undefined {
  const call = isPunct(tokenAt(tokens, index - 1), ".") ? undefined : callArguments(tokens, index);
  if (call === undefined || call.items.length > 2 || !isStatementEnd(tokens, call.close + 1)) {
    return undefined;
  }
  const [namespace, options] = call.items;
  const isStatic =
    (namespace === undefined || isStaticNamespace(tokens, namespace)) &&
    (options === undefined || isStaticOptions(tokens, options, rules));
  return isStatic ? declaredPattern(tokens, index) : undefined;
}

function referenceStart(tokens: readonly SourceToken[], index: number): number {
  let start = index;
  while (isPunct(tokenAt(tokens, start - 1), ".") && tokenAt(tokens, start - 2)?.kind === "ident") {
    start -= 2;
  }
  return start;
}

function fixedBinding(tokens: readonly SourceToken[], index: number): Binding | undefined {
  const call = callArguments(tokens, index);
  const isStatic =
    call !== undefined &&
    call.items.length <= 3 &&
    call.items.every((item) => isStaticFixedArgument(tokens, item)) &&
    isStatementEnd(tokens, call.close + 1);
  return isStatic
    ? nameBinding(tokens, declaredNameIndex(tokens, referenceStart(tokens, index)))
    : undefined;
}

function memberBinding(tokens: readonly SourceToken[], index: number): Binding | undefined {
  const end = boundEnd(tokens, index + 1);
  return isStatementEnd(tokens, end)
    ? nameBinding(tokens, declaredNameIndex(tokens, referenceStart(tokens, index)))
    : undefined;
}

function isRecognisedHoc(tokens: readonly SourceToken[], index: number): boolean {
  const call = callArguments(tokens, index);
  if (call === undefined || call.items.length > 1) {
    return false;
  }
  const [namespace] = call.items;
  const wraps =
    isPunct(tokenAt(tokens, call.close + 1), "(") &&
    tokenAt(tokens, call.close + 2)?.kind === "ident" &&
    isPunct(tokenAt(tokens, call.close + 3), ")");
  return wraps && (namespace === undefined || isStaticNamespace(tokens, namespace));
}

function tagEnd(tokens: readonly SourceToken[], index: number): number | undefined {
  let depth = 0;
  for (let cursor = index; cursor < tokens.length; cursor += 1) {
    const token = tokenAt(tokens, cursor);
    depth += isPunct(token, "{") ? 1 : 0;
    depth -= isPunct(token, "}") ? 1 : 0;
    if (depth === 0 && isPunct(token, ">")) {
      return cursor;
    }
  }
  return undefined;
}

function renderPropBinding(tokens: readonly SourceToken[], index: number): Binding | undefined {
  const end = tagEnd(tokens, index + 2);
  if (end === undefined || isPunct(tokenAt(tokens, end - 1), "/")) {
    return undefined;
  }
  const parameters = end + 2;
  const paramsClose = isPunct(tokenAt(tokens, parameters), "(")
    ? closeIndex(tokens, parameters)
    : undefined;
  const isRenderProp =
    isPunct(tokenAt(tokens, end + 1), "{") &&
    paramsClose !== undefined &&
    isPunct(tokenAt(tokens, paramsClose + 1), "=") &&
    isPunct(tokenAt(tokens, paramsClose + 2), ">");
  return isRenderProp ? nameBinding(tokens, parameters + 1) : undefined;
}

function recordBinding(state: SourceState, binding: Binding): void {
  for (const name of binding.names) {
    state.identifiers.add(name);
  }
  for (const index of binding.indices) {
    state.allowed.add(index);
  }
}

function recordSource(
  tokens: readonly SourceToken[],
  index: number,
  state: SourceState,
  outcome: Binding | boolean | undefined,
): void {
  if (outcome === undefined || outcome === false) {
    state.unresolved.push({ reason: "unrecognised-translate-source", line: lineAt(tokens, index) });
  } else if (outcome !== true) {
    recordBinding(state, outcome);
  }
}

function sourceOutcome(
  tokens: readonly SourceToken[],
  index: number,
  rules: KeyUsageRules,
): Binding | boolean | undefined | null {
  const token = tokenAt(tokens, index);
  if (isIdentNamed(token, rules.hookNames)) {
    return hookBinding(tokens, index, rules);
  }
  if (isIdentNamed(token, rules.hocNames)) {
    return isRecognisedHoc(tokens, index);
  }
  if (isIdentNamed(token, rules.fixedTranslateNames)) {
    return fixedBinding(tokens, index);
  }
  if (isPunct(token, "<") && isIdentNamed(tokenAt(tokens, index + 1), rules.renderPropElements)) {
    return renderPropBinding(tokens, index);
  }
  const isMember =
    isIdentNamed(token, rules.memberTranslateNames) && isPunct(tokenAt(tokens, index - 1), ".");
  if (!isMember) {
    return null;
  }
  return callOpenIndex(tokens, index) !== undefined || memberBinding(tokens, index);
}

interface ImportSpecifier {
  readonly name: number;
  readonly alias: number | undefined;
}

function importSpecifier(
  tokens: readonly SourceToken[],
  item: readonly number[],
): ImportSpecifier | undefined {
  const names = item.filter((index) => tokenAt(tokens, index)?.kind === "ident");
  const [first, second, third, fourth] = names;
  if (identValue(tokenAt(tokens, first ?? -1)) === "type") {
    return second === undefined ? undefined : { name: second, alias: fourth };
  }
  return first === undefined
    ? undefined
    : {
        name: first,
        alias: identValue(tokenAt(tokens, second ?? -1)) === "as" ? third : undefined,
      };
}

function importModule(tokens: readonly SourceToken[], closer: number): string | undefined {
  const module = tokenAt(tokens, closer + 2);
  return identValue(tokenAt(tokens, closer + 1)) === "from" && module?.kind === "string"
    ? module.value
    : undefined;
}

function sourceNames(rules: KeyUsageRules): ReadonlySet<string> {
  return new Set([
    ...rules.hookNames,
    ...rules.hocNames,
    ...rules.fixedTranslateNames,
    ...rules.renderPropElements,
    ...rules.memberTranslateNames,
  ]);
}

function recordSpecifier(
  tokens: readonly SourceToken[],
  specifier: ImportSpecifier,
  module: string | undefined,
  rules: KeyUsageRules,
  state: SourceState,
): void {
  state.imports.add(specifier.name);
  const name = identValue(tokenAt(tokens, specifier.name)) ?? "";
  const bound = specifier.alias ?? specifier.name;
  state.imports.add(bound);
  const isTranslateImport =
    rules.memberTranslateNames.has(name) &&
    module !== undefined &&
    rules.translateModules.has(module);
  if (isTranslateImport) {
    recordBinding(state, { names: [identValue(tokenAt(tokens, bound)) ?? name], indices: [bound] });
  } else if (specifier.alias !== undefined && sourceNames(rules).has(name)) {
    state.unresolved.push({ reason: "unrecognised-translate-source", line: lineAt(tokens, bound) });
  }
}

function importOpener(tokens: readonly SourceToken[], index: number): number | undefined {
  let cursor = index + 1;
  while (tokenAt(tokens, cursor)?.kind === "ident" || isPunct(tokenAt(tokens, cursor), ",")) {
    cursor += 1;
  }
  return isPunct(tokenAt(tokens, cursor), "{") ? cursor : undefined;
}

function collectImports(
  tokens: readonly SourceToken[],
  index: number,
  rules: KeyUsageRules,
  state: SourceState,
): void {
  const opener =
    identValue(tokenAt(tokens, index)) === "import" ? importOpener(tokens, index) : undefined;
  const closer = opener === undefined ? undefined : matchingClose(tokens, opener + 1);
  if (opener === undefined || closer === undefined) {
    return;
  }
  const module = importModule(tokens, closer);
  for (const item of listItems(tokens, opener, closer)) {
    const specifier = importSpecifier(tokens, item);
    if (specifier !== undefined) {
      recordSpecifier(tokens, specifier, module, rules, state);
    }
  }
}

function aliasBinding(
  tokens: readonly SourceToken[],
  index: number,
  identifiers: ReadonlySet<string>,
): Binding | undefined {
  const value = tokenAt(tokens, index);
  const nameIndex = isIdentNamed(value, identifiers) ? declaredNameIndex(tokens, index) : undefined;
  const isAlias = nameIndex !== undefined && isStatementEnd(tokens, boundEnd(tokens, index + 1));
  return isAlias
    ? { names: nameBinding(tokens, nameIndex)?.names ?? [], indices: [nameIndex, index] }
    : undefined;
}

function collectAliases(tokens: readonly SourceToken[], state: SourceState): void {
  let size = -1;
  while (size !== state.identifiers.size) {
    size = state.identifiers.size;
    for (let index = 0; index < tokens.length; index += 1) {
      const binding = aliasBinding(tokens, index, state.identifiers);
      if (binding !== undefined) {
        recordBinding(state, binding);
      }
    }
  }
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

function collectEscapes(
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

export function readTranslateSources(
  tokens: readonly SourceToken[],
  rules: KeyUsageRules,
): TranslateSources {
  const state: SourceState = {
    identifiers: new Set(),
    allowed: new Set(),
    imports: new Set(),
    unresolved: [],
  };
  for (let index = 0; index < tokens.length; index += 1) {
    collectImports(tokens, index, rules, state);
  }
  for (let index = 0; index < tokens.length; index += 1) {
    const outcome = state.imports.has(index) ? null : sourceOutcome(tokens, index, rules);
    if (outcome !== null) {
      recordSource(tokens, index, state, outcome);
    }
  }
  collectAliases(tokens, state);
  collectEscapes(tokens, rules, state);
  const unique = new Map(state.unresolved.map((site) => [`${site.reason}:${site.line}`, site]));
  return { identifiers: state.identifiers, unresolved: [...unique.values()] };
}
