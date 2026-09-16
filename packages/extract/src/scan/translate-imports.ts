import type { KeyUsageRules } from "./key-usage.js";
import { isPunct, listItems, matchingClose, tokenAt } from "./token-query.js";
import type { SourceToken } from "./tokenize.js";
import { identValue, lineAt, recordBinding, type SourceState } from "./translate-state.js";

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

export function collectImports(
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
