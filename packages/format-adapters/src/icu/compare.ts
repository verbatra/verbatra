import {
  type MessageFormatElement,
  type PluralElement,
  parse,
  type SelectElement,
  type TagElement,
  TYPE,
} from "@formatjs/icu-messageformat-parser";
import { checkPlaceholders, type PlaceholderIntegrityResult } from "@verbatra/core";
import { icuPlaceholders, tokenOf } from "./analyze.js";

export type BranchingElement = PluralElement | SelectElement;

export function isBranching(element: MessageFormatElement): element is BranchingElement {
  return element.type === TYPE.plural || element.type === TYPE.select;
}

export function isTag(element: MessageFormatElement): element is TagElement {
  return element.type === TYPE.tag;
}

function layerTokens(elements: readonly MessageFormatElement[]): string[] {
  const tokens: string[] = [];
  for (const element of elements) {
    const token = tokenOf(element);
    if (token !== undefined) {
      tokens.push(token);
    }
  }
  return tokens;
}

function deepTokens(elements: readonly MessageFormatElement[]): string[] {
  const tokens: string[] = [];
  for (const element of elements) {
    const token = tokenOf(element);
    if (token !== undefined) {
      tokens.push(token);
    }
    if (isTag(element)) {
      tokens.push(...deepTokens(element.children));
    } else if (isBranching(element)) {
      for (const option of Object.values(element.options)) {
        tokens.push(...deepTokens(option.value));
      }
    }
  }
  return tokens;
}

function branchesByCategory(
  element: BranchingElement,
): Map<string, readonly MessageFormatElement[]> {
  return new Map(
    Object.entries(element.options).map(([category, option]) => [category, option.value]),
  );
}

function findUnconsumed<T extends MessageFormatElement>(
  target: readonly MessageFormatElement[],
  consumed: ReadonlySet<number>,
  isMatch: (candidate: MessageFormatElement) => candidate is T,
): { readonly element: T; readonly index: number } | undefined {
  for (let index = 0; index < target.length; index += 1) {
    if (consumed.has(index)) {
      continue;
    }
    const candidate = target[index];
    if (candidate !== undefined && isMatch(candidate)) {
      return { element: candidate, index };
    }
  }
  return undefined;
}

export function findMatchingBranching(
  source: BranchingElement,
  target: readonly MessageFormatElement[],
  consumed: ReadonlySet<number>,
): { readonly element: BranchingElement; readonly index: number } | undefined {
  return findUnconsumed(
    target,
    consumed,
    (candidate): candidate is BranchingElement =>
      isBranching(candidate) && candidate.value === source.value,
  );
}

export function findMatchingTag(
  source: TagElement,
  target: readonly MessageFormatElement[],
  consumed: ReadonlySet<number>,
): { readonly element: TagElement; readonly index: number } | undefined {
  return findUnconsumed(
    target,
    consumed,
    (candidate): candidate is TagElement => isTag(candidate) && candidate.value === source.value,
  );
}

function combineResults(
  results: readonly PlaceholderIntegrityResult[],
): PlaceholderIntegrityResult {
  const missing = results.flatMap((result) => result.missing).sort();
  const extra = results.flatMap((result) => result.extra).sort();
  return { matches: missing.length === 0 && extra.length === 0, missing, extra, reordered: false };
}

function compareAgainstSourceUnion(
  sourceBranches: ReadonlyMap<string, readonly MessageFormatElement[]>,
  targetBranch: readonly MessageFormatElement[],
): PlaceholderIntegrityResult {
  const union = new Set<string>();
  for (const branch of sourceBranches.values()) {
    for (const token of deepTokens(branch)) {
      union.add(token);
    }
  }
  const extra = deepTokens(targetBranch)
    .filter((token) => !union.has(token))
    .sort();
  return { matches: extra.length === 0, missing: [], extra, reordered: false };
}

function compareBranching(
  source: BranchingElement,
  target: BranchingElement,
): PlaceholderIntegrityResult {
  const sourceBranches = branchesByCategory(source);
  const targetBranches = branchesByCategory(target);
  const categories = new Set([...sourceBranches.keys(), ...targetBranches.keys()]);
  const results: PlaceholderIntegrityResult[] = [];
  for (const category of categories) {
    const sourceBranch = sourceBranches.get(category);
    const targetBranch = targetBranches.get(category);
    if (sourceBranch !== undefined && targetBranch !== undefined) {
      results.push(compareElements(sourceBranch, targetBranch));
    } else if (targetBranch !== undefined) {
      results.push(compareAgainstSourceUnion(sourceBranches, targetBranch));
    }
  }
  return combineResults(results);
}

function nestedResults(
  source: readonly MessageFormatElement[],
  target: readonly MessageFormatElement[],
): PlaceholderIntegrityResult[] {
  const results: PlaceholderIntegrityResult[] = [];
  const consumed = new Set<number>();
  for (const element of source) {
    if (isBranching(element)) {
      const found = findMatchingBranching(element, target, consumed);
      if (found !== undefined) {
        consumed.add(found.index);
        results.push(compareBranching(element, found.element));
      }
    } else if (isTag(element)) {
      const found = findMatchingTag(element, target, consumed);
      if (found !== undefined) {
        consumed.add(found.index);
        results.push(compareElements(element.children, found.element.children));
      }
    }
  }
  return results;
}

function compareElements(
  source: readonly MessageFormatElement[],
  target: readonly MessageFormatElement[],
): PlaceholderIntegrityResult {
  const layer = checkPlaceholders(layerTokens(source), layerTokens(target));
  const nested = nestedResults(source, target);
  return nested.length === 0 ? layer : combineResults([layer, ...nested]);
}

export function compareIcuPlaceholders(
  sourceValue: string,
  targetValue: string,
): PlaceholderIntegrityResult {
  try {
    const sourceAst = parse(sourceValue);
    const targetAst = parse(targetValue);
    return compareElements(sourceAst, targetAst);
  } catch {
    return checkPlaceholders(icuPlaceholders(sourceValue), icuPlaceholders(targetValue));
  }
}
