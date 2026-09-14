import type { DynamicCallSite, ExtractedCallSite, FileExtraction } from "../extractor.js";
import { type SourceToken, tokenizeSource } from "./tokenize.js";

export interface CallSiteRules {
  readonly calleeNames: ReadonlySet<string>;
  readonly defaultValueKeys: ReadonlySet<string>;
  readonly namespaceSeparator?: string;
}

const ARGUMENT_TERMINATORS = new Set([",", ")"]);

const OPTION_TERMINATORS = new Set([",", "}"]);

const MEMBER_PRECEDERS = new Set(["{", ",", ";", "}"]);

const MEMBER_MODIFIERS = new Set([
  "function",
  "async",
  "static",
  "get",
  "set",
  "declare",
  "abstract",
  "override",
  "public",
  "private",
  "protected",
  "readonly",
]);

const SIGNATURE_FOLLOWERS = new Set(["{", ":"]);

function tokenAt(tokens: readonly SourceToken[], index: number): SourceToken | undefined {
  return tokens[index];
}

function isPunct(token: SourceToken | undefined, value: string): boolean {
  return token?.kind === "punct" && token.value === value;
}

function isFollowedBy(
  tokens: readonly SourceToken[],
  index: number,
  terminators: ReadonlySet<string>,
): boolean {
  const next = tokenAt(tokens, index + 1);
  return next === undefined || (next.kind === "punct" && terminators.has(next.value));
}

function skipTypeArguments(tokens: readonly SourceToken[], index: number): number | undefined {
  let depth = 0;
  for (let cursor = index; cursor < tokens.length; cursor += 1) {
    if (isPunct(tokenAt(tokens, cursor), "<")) {
      depth += 1;
    } else if (isPunct(tokenAt(tokens, cursor), ">")) {
      depth -= 1;
      if (depth === 0) {
        return cursor + 1;
      }
    }
  }
  return undefined;
}

function callOpenIndex(tokens: readonly SourceToken[], index: number): number | undefined {
  let cursor = index + 1;
  if (isPunct(tokenAt(tokens, cursor), "?") && isPunct(tokenAt(tokens, cursor + 1), ".")) {
    cursor += 2;
  }
  if (isPunct(tokenAt(tokens, cursor), "<")) {
    const afterTypeArguments = skipTypeArguments(tokens, cursor);
    if (afterTypeArguments === undefined) {
      return undefined;
    }
    cursor = afterTypeArguments;
  }
  return isPunct(tokenAt(tokens, cursor), "(") ? cursor : undefined;
}

function closeIndex(tokens: readonly SourceToken[], openIndex: number): number {
  let depth = 0;
  for (let cursor = openIndex; cursor < tokens.length; cursor += 1) {
    if (isPunct(tokenAt(tokens, cursor), "(")) {
      depth += 1;
    } else if (isPunct(tokenAt(tokens, cursor), ")")) {
      depth -= 1;
      if (depth === 0) {
        return cursor;
      }
    }
  }
  return tokens.length;
}

function isSignature(tokens: readonly SourceToken[], index: number, openIndex: number): boolean {
  const previous = tokenAt(tokens, index - 1);
  if (previous?.kind === "ident") {
    return MEMBER_MODIFIERS.has(previous.value);
  }
  if (previous?.kind !== "punct" || !MEMBER_PRECEDERS.has(previous.value)) {
    return false;
  }
  const follower = tokenAt(tokens, closeIndex(tokens, openIndex) + 1);
  return follower?.kind === "punct" && SIGNATURE_FOLLOWERS.has(follower.value);
}

function isCallee(tokens: readonly SourceToken[], index: number, rules: CallSiteRules): boolean {
  const token = tokenAt(tokens, index);
  return token?.kind === "ident" && rules.calleeNames.has(token.value);
}

function readOptionsDefault(
  tokens: readonly SourceToken[],
  start: number,
  rules: CallSiteRules,
): string | undefined {
  let depth = 0;
  for (let index = start; index < tokens.length; index += 1) {
    const token = tokenAt(tokens, index);
    if (isPunct(token, "{")) {
      depth += 1;
    } else if (isPunct(token, "}")) {
      depth -= 1;
      if (depth === 0) {
        return undefined;
      }
    } else if (depth === 1 && token?.kind === "ident" && rules.defaultValueKeys.has(token.value)) {
      const value = tokenAt(tokens, index + 2);
      if (
        isPunct(tokenAt(tokens, index + 1), ":") &&
        value?.kind === "string" &&
        isFollowedBy(tokens, index + 2, OPTION_TERMINATORS)
      ) {
        return value.value;
      }
    }
  }
  return undefined;
}

function readDefaultValue(
  tokens: readonly SourceToken[],
  keyIndex: number,
  rules: CallSiteRules,
): string | undefined {
  if (!isPunct(tokenAt(tokens, keyIndex + 1), ",")) {
    return undefined;
  }
  const candidate = tokenAt(tokens, keyIndex + 2);
  if (candidate?.kind === "string") {
    return isFollowedBy(tokens, keyIndex + 2, ARGUMENT_TERMINATORS) ? candidate.value : undefined;
  }
  return isPunct(candidate, "{") ? readOptionsDefault(tokens, keyIndex + 2, rules) : undefined;
}

function isNamespaced(key: string, rules: CallSiteRules): boolean {
  return rules.namespaceSeparator !== undefined && key.includes(rules.namespaceSeparator);
}

function callSiteAt(
  tokens: readonly SourceToken[],
  index: number,
  rules: CallSiteRules,
): ExtractedCallSite | DynamicCallSite | undefined {
  const openIndex = callOpenIndex(tokens, index);
  if (openIndex === undefined || isSignature(tokens, index, openIndex)) {
    return undefined;
  }
  const keyIndex = openIndex + 1;
  const argument = tokenAt(tokens, keyIndex);
  if (argument === undefined || isPunct(argument, ")")) {
    return undefined;
  }
  if (argument.kind !== "string" || !isFollowedBy(tokens, keyIndex, ARGUMENT_TERMINATORS)) {
    return { line: argument.line };
  }
  if (argument.value === "") {
    return undefined;
  }
  if (isNamespaced(argument.value, rules)) {
    return { line: argument.line };
  }
  const defaultValue = readDefaultValue(tokens, keyIndex, rules);
  return {
    key: argument.value,
    ...(defaultValue !== undefined ? { defaultValue } : {}),
    line: argument.line,
  };
}

export function findCallSites(content: string, rules: CallSiteRules): FileExtraction {
  const tokens = tokenizeSource(content);
  const calls: ExtractedCallSite[] = [];
  const dynamic: DynamicCallSite[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    if (!isCallee(tokens, index, rules)) {
      continue;
    }
    const site = callSiteAt(tokens, index, rules);
    if (site === undefined) {
      continue;
    }
    if ("key" in site) {
      calls.push(site);
    } else {
      dynamic.push(site);
    }
  }
  return { calls, dynamic };
}
