import type { UnresolvedKeySite } from "../extractor.js";
import { tokenAt } from "./token-query.js";
import type { SourceToken } from "./tokenize.js";

export interface Binding {
  readonly names: readonly string[];
  readonly indices: readonly number[];
}

export interface SourceState {
  readonly identifiers: Set<string>;
  readonly allowed: Set<number>;
  readonly imports: Set<number>;
  readonly unresolved: UnresolvedKeySite[];
}

export function lineAt(tokens: readonly SourceToken[], index: number): number {
  return tokenAt(tokens, index)?.line ?? 0;
}

export function identValue(token: SourceToken | undefined): string | undefined {
  return token?.kind === "ident" ? token.value : undefined;
}

export function recordBinding(state: SourceState, binding: Binding): void {
  for (const name of binding.names) {
    state.identifiers.add(name);
  }
  for (const index of binding.indices) {
    state.allowed.add(index);
  }
}
