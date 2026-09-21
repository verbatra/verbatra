import { boundEnd, isAssignmentAt, isIdentNamed, type KeyUsageRules } from "./key-usage.js";
import {
  closeIndex,
  DECLARATION_KEYWORDS,
  identValue,
  isPunct,
  listItems,
  matchingOpen,
  tokenAt,
} from "./token-query.js";
import type { SourceToken } from "./tokenize.js";
import {
  callArguments,
  isLanguageArgument,
  isStatementEnd,
  isStaticFixedArgument,
  isStaticNamespace,
  isStaticOptions,
  referenceStart,
} from "./translate-arguments.js";
import type { Binding } from "./translate-state.js";

const HOOK_PATTERN_NAMES = new Set(["t", "i18n", "ready"]);

export const TRANSLATE_PATTERN_NAME = "t";

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

function patternItem(
  tokens: readonly SourceToken[],
  item: readonly number[],
  accepted: ReadonlySet<string> | undefined,
): Binding | undefined {
  const [nameIndex, colonIndex, aliasIndex] = item;
  const name = identValue(tokenAt(tokens, nameIndex ?? -1));
  const alias = identValue(tokenAt(tokens, aliasIndex ?? -1));
  const isRejected = name !== undefined && accepted !== undefined && !accepted.has(name);
  if (name === undefined || nameIndex === undefined || isRejected) {
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
  accepted: ReadonlySet<string> | undefined,
): Binding | undefined {
  const bindings = items.map((item) => patternItem(tokens, item, accepted));
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

function declaredPattern(
  tokens: readonly SourceToken[],
  valueStart: number,
  accepted: ReadonlySet<string> | undefined,
): Binding | undefined {
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
    return objectPatternBinding(tokens, items, accepted);
  }
  return isPunct(tokenAt(tokens, opener), "[") ? arrayPatternBinding(tokens, items) : undefined;
}

export function hookBinding(
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
  return isStatic ? declaredPattern(tokens, index, HOOK_PATTERN_NAMES) : undefined;
}

export function instanceBinding(
  tokens: readonly SourceToken[],
  index: number,
): Binding | undefined {
  const isObjectPattern =
    isPunct(tokenAt(tokens, index - 2), "}") && isStatementEnd(tokens, index + 1);
  const binding = isObjectPattern ? declaredPattern(tokens, index, undefined) : undefined;
  return binding !== undefined && binding.names.length > 0 ? binding : undefined;
}

export function fixedBinding(tokens: readonly SourceToken[], index: number): Binding | undefined {
  const call = callArguments(tokens, index);
  const isStatic =
    call !== undefined &&
    call.items.length <= 3 &&
    call.items.every((item, position) =>
      position === 0 ? isLanguageArgument(tokens, item) : isStaticFixedArgument(tokens, item),
    ) &&
    isStatementEnd(tokens, call.close + 1);
  return isStatic
    ? nameBinding(tokens, declaredNameIndex(tokens, referenceStart(tokens, index)))
    : undefined;
}

export function memberBinding(tokens: readonly SourceToken[], index: number): Binding | undefined {
  const end = boundEnd(tokens, index + 1);
  return isStatementEnd(tokens, end)
    ? nameBinding(tokens, declaredNameIndex(tokens, referenceStart(tokens, index)))
    : undefined;
}

export function isRecognisedHoc(tokens: readonly SourceToken[], index: number): boolean {
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

export function renderPropBinding(
  tokens: readonly SourceToken[],
  index: number,
): Binding | undefined {
  const end = tagEnd(tokens, index + 2);
  if (end === undefined || isPunct(tokenAt(tokens, end - 1), "/")) {
    return undefined;
  }
  const parameters = end + 2;
  const isBare = tokenAt(tokens, parameters)?.kind === "ident";
  const paramsClose = isPunct(tokenAt(tokens, parameters), "(")
    ? closeIndex(tokens, parameters)
    : undefined;
  const arrowAt = isBare ? parameters : paramsClose;
  const isRenderProp =
    isPunct(tokenAt(tokens, end + 1), "{") &&
    arrowAt !== undefined &&
    isPunct(tokenAt(tokens, arrowAt + 1), "=") &&
    isPunct(tokenAt(tokens, arrowAt + 2), ">");
  return isRenderProp ? nameBinding(tokens, isBare ? parameters : parameters + 1) : undefined;
}

export function aliasBinding(
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
