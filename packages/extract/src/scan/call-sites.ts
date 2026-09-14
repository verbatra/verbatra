import type { DynamicCallSite, ExtractedCallSite, FileExtraction } from "../extractor.js";
import { type SourceToken, tokenizeSource } from "./tokenize.js";

export interface CallSiteRules {
  readonly calleeNames: ReadonlySet<string>;
  readonly defaultValueKeys: ReadonlySet<string>;
}

function tokenAt(tokens: readonly SourceToken[], index: number): SourceToken | undefined {
  return tokens[index];
}

function isPunct(token: SourceToken | undefined, value: string): boolean {
  return token?.kind === "punct" && token.value === value;
}

function isCallee(tokens: readonly SourceToken[], index: number, rules: CallSiteRules): boolean {
  const token = tokenAt(tokens, index);
  if (token?.kind !== "ident" || !rules.calleeNames.has(token.value)) {
    return false;
  }
  const previous = tokenAt(tokens, index - 1);
  if (previous?.kind === "ident" && previous.value === "function") {
    return false;
  }
  return isPunct(tokenAt(tokens, index + 1), "(");
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
      if (isPunct(tokenAt(tokens, index + 1), ":") && value?.kind === "string") {
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
    return candidate.value;
  }
  return isPunct(candidate, "{") ? readOptionsDefault(tokens, keyIndex + 2, rules) : undefined;
}

function callSiteAt(
  tokens: readonly SourceToken[],
  index: number,
  rules: CallSiteRules,
): ExtractedCallSite | DynamicCallSite | undefined {
  const argument = tokenAt(tokens, index + 2);
  if (argument === undefined || isPunct(argument, ")")) {
    return undefined;
  }
  if (argument.kind !== "string") {
    return { line: argument.line };
  }
  if (argument.value === "") {
    return undefined;
  }
  const defaultValue = readDefaultValue(tokens, index + 2, rules);
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
