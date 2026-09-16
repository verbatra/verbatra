import type { UnresolvedKeySite } from "../extractor.js";
import { isIdentNamed, type KeyUsageRules } from "./key-usage.js";
import { callOpenIndex, isPunct, tokenAt } from "./token-query.js";
import type { SourceToken } from "./tokenize.js";
import {
  aliasBinding,
  fixedBinding,
  hookBinding,
  isRecognisedHoc,
  memberBinding,
  renderPropBinding,
} from "./translate-bindings.js";
import { collectEscapes, collectUnrecognisedBindings } from "./translate-escapes-check.js";
import { collectImports } from "./translate-imports.js";
import { type Binding, lineAt, recordBinding, type SourceState } from "./translate-state.js";

export interface TranslateSources {
  readonly identifiers: ReadonlySet<string>;
  readonly unresolved: readonly UnresolvedKeySite[];
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
  for (const name of rules.calleeNames) {
    state.identifiers.add(name);
  }
  collectAliases(tokens, state);
  collectUnrecognisedBindings(tokens, rules, state);
  collectEscapes(tokens, rules, state);
  const unique = new Map(state.unresolved.map((site) => [`${site.reason}:${site.line}`, site]));
  return { identifiers: state.identifiers, unresolved: [...unique.values()] };
}
