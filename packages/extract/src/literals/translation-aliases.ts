import type { PositionedToken } from "../scan/tokenize.js";
import type { TranslationRecognition } from "./literal-audience.js";
import { identValue, isPunct } from "./literal-frames.js";

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

export function withTranslationAliases(
  tokens: readonly PositionedToken[],
  rules: TranslationRecognition,
): TranslationRecognition {
  const aliases = new Set<string>();
  tokens.forEach((_token, index) => {
    const alias = aliasAt(tokens, index, rules);
    if (alias !== undefined) {
      aliases.add(alias);
    }
  });
  if (aliases.size === 0) {
    return rules;
  }
  return { ...rules, calleeNames: new Set([...rules.calleeNames, ...aliases]) };
}
