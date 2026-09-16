import { identValue, isPunct } from "../scan/token-query.js";
import type { PositionedToken } from "../scan/tokenize.js";
import type { TranslationRecognition } from "./literal-audience.js";

const DESTRUCTURING_LIMIT = 50;

function destructuredFrom(tokens: readonly PositionedToken[], start: number): string | undefined {
  let depth = 0;
  const limit = Math.min(tokens.length, start + DESTRUCTURING_LIMIT);
  for (let index = start; index < limit; index += 1) {
    const token = tokens[index];
    if (isPunct(token, "{")) {
      depth += 1;
    } else if (isPunct(token, "}") && depth > 0) {
      depth -= 1;
    } else if (isPunct(token, "}")) {
      return isPunct(tokens[index + 1], "=") ? identValue(tokens[index + 2]) : undefined;
    }
  }
  return undefined;
}

function opensRenamedProperty(tokens: readonly PositionedToken[], index: number): boolean {
  const previous = tokens[index - 1];
  return (isPunct(previous, "{") || isPunct(previous, ",")) && isPunct(tokens[index + 1], ":");
}

function aliasAt(
  tokens: readonly PositionedToken[],
  index: number,
  rules: TranslationRecognition,
): string | undefined {
  const name = identValue(tokens[index]);
  const alias = identValue(tokens[index + 2]);
  if (name === undefined || alias === undefined || !opensRenamedProperty(tokens, index)) {
    return undefined;
  }
  const source = destructuredFrom(tokens, index + 3);
  const renamesTranslation = rules.calleeNames.has(name) && source !== undefined;
  return renamesTranslation && rules.translationHooks.has(source) ? alias : undefined;
}

interface AliasScope {
  readonly name: string;
  readonly first: number;
  last: number;
}

interface RecognitionSegment {
  readonly start: number;
  readonly recognition: TranslationRecognition;
}

export type RecognitionAt = (index: number) => TranslationRecognition;

function collectAliasScopes(
  tokens: readonly PositionedToken[],
  rules: TranslationRecognition,
): AliasScope[] {
  const scopes: AliasScope[] = [];
  const blocks: AliasScope[][] = [[]];
  tokens.forEach((token, index) => {
    if (isPunct(token, "{")) {
      blocks.push([]);
    } else if (isPunct(token, "}") && blocks.length > 1) {
      for (const scope of blocks.pop() ?? []) {
        scope.last = index;
      }
    }
    const name = aliasAt(tokens, index, rules);
    if (name !== undefined) {
      const scope = { name, first: index, last: tokens.length - 1 };
      scopes.push(scope);
      blocks[blocks.length - 2]?.push(scope);
    }
  });
  return scopes;
}

function recognitionWith(
  rules: TranslationRecognition,
  scopes: readonly AliasScope[],
  index: number,
): TranslationRecognition {
  const active = scopes.filter((scope) => scope.first <= index && index <= scope.last);
  if (active.length === 0) {
    return rules;
  }
  const calleeNames = new Set([...rules.calleeNames, ...active.map((scope) => scope.name)]);
  return { ...rules, calleeNames };
}

function segmentsOf(
  rules: TranslationRecognition,
  scopes: readonly AliasScope[],
): RecognitionSegment[] {
  const starts = new Set([0, ...scopes.flatMap((scope) => [scope.first, scope.last + 1])]);
  return [...starts]
    .sort((left, right) => left - right)
    .map((start) => ({ start, recognition: recognitionWith(rules, scopes, start) }));
}

function segmentIndexAt(segments: readonly RecognitionSegment[], index: number): number {
  let low = 0;
  let high = segments.length - 1;
  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    if ((segments[middle]?.start ?? 0) <= index) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }
  return low;
}

export function translationRecognitionAt(
  tokens: readonly PositionedToken[],
  rules: TranslationRecognition,
): RecognitionAt {
  const scopes = collectAliasScopes(tokens, rules);
  if (scopes.length === 0) {
    return () => rules;
  }
  const segments = segmentsOf(rules, scopes);
  return (index) => segments[segmentIndexAt(segments, index)]?.recognition ?? rules;
}
