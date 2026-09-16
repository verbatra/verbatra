import type {
  DynamicCallSite,
  ExtractedCallSite,
  FileExtraction,
  KeyPrefixSite,
  ReferencedKeySite,
} from "../extractor.js";
import {
  type KeyUsageRules,
  type KeyUsageSites,
  keyForms,
  prefixedKey,
  prefixForms,
  readKeyUsageSites,
} from "./key-usage.js";
import {
  callOpenIndex,
  closeIndex,
  isFollowedBy,
  isPunct,
  listItems,
  matchingClose,
  tokenAt,
} from "./token-query.js";
import { type SourceToken, tokenizeSource } from "./tokenize.js";
import { readTranslateSources } from "./translate-sources.js";

export interface CallSiteRules extends KeyUsageRules {
  readonly defaultValueKeys: ReadonlySet<string>;
}

type TemplateToken = Extract<SourceToken, { readonly kind: "dynamic" }>;

type CallSiteReading =
  | { readonly kind: "static"; readonly site: ExtractedCallSite }
  | { readonly kind: "named"; readonly keys: readonly string[]; readonly line: number }
  | { readonly kind: "prefix"; readonly prefixes: readonly string[]; readonly line: number }
  | { readonly kind: "dynamic"; readonly line: number };

interface CallSiteState {
  readonly calls: ExtractedCallSite[];
  readonly dynamic: DynamicCallSite[];
  readonly references: ReferencedKeySite[];
  readonly usageDynamic: DynamicCallSite[];
  readonly prefixes: KeyPrefixSite[];
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

function hasEmptySegment(key: string, rules: CallSiteRules): boolean {
  return rules.keySeparator !== undefined && key.split(rules.keySeparator).includes("");
}

function isUnresolvableKey(key: string, rules: CallSiteRules): boolean {
  return isNamespaced(key, rules) || hasEmptySegment(key, rules);
}

function templateReading(
  tokens: readonly SourceToken[],
  keyIndex: number,
  template: TemplateToken,
  rules: CallSiteRules,
): CallSiteReading {
  const prefixes =
    template.head === undefined || template.head === ""
      ? undefined
      : prefixForms(template.head, rules);
  const endsArgument = isFollowedBy(tokens, keyIndex + (template.span ?? 0), ARGUMENT_TERMINATORS);
  return prefixes !== undefined && endsArgument
    ? { kind: "prefix", prefixes, line: template.line }
    : { kind: "dynamic", line: template.line };
}

function keyListReading(
  tokens: readonly SourceToken[],
  keyIndex: number,
  rules: CallSiteRules,
): CallSiteReading {
  const close = matchingClose(tokens, keyIndex + 1);
  const items = close === undefined ? [] : listItems(tokens, keyIndex, close);
  const keys = items.map((item) =>
    item.length === 1 ? tokenAt(tokens, item[0] ?? -1) : undefined,
  );
  const line = tokenAt(tokens, keyIndex)?.line ?? 0;
  const isStatic =
    close !== undefined &&
    keys.length > 0 &&
    keys.every((key) => key?.kind === "string" && key.value !== "") &&
    isFollowedBy(tokens, close, ARGUMENT_TERMINATORS);
  if (!isStatic) {
    return { kind: "dynamic", line };
  }
  const forms = keys.flatMap((key) => (key?.kind === "string" ? keyForms(key.value, rules) : []));
  return { kind: "named", keys: forms, line };
}

function callSiteAt(
  tokens: readonly SourceToken[],
  index: number,
  rules: CallSiteRules,
): CallSiteReading | undefined {
  const openIndex = callOpenIndex(tokens, index);
  if (openIndex === undefined || isSignature(tokens, index, openIndex)) {
    return undefined;
  }
  const keyIndex = openIndex + 1;
  const argument = tokenAt(tokens, keyIndex);
  if (argument === undefined || isPunct(argument, ")")) {
    return undefined;
  }
  if (argument.kind === "dynamic") {
    return templateReading(tokens, keyIndex, argument, rules);
  }
  if (isPunct(argument, "[")) {
    return keyListReading(tokens, keyIndex, rules);
  }
  if (argument.kind !== "string" || !isFollowedBy(tokens, keyIndex, ARGUMENT_TERMINATORS)) {
    return { kind: "dynamic", line: argument.line };
  }
  if (argument.value === "") {
    return undefined;
  }
  if (isUnresolvableKey(argument.value, rules)) {
    return { kind: "named", keys: keyForms(argument.value, rules), line: argument.line };
  }
  const defaultValue = readDefaultValue(tokens, keyIndex, rules);
  return {
    kind: "static",
    site: {
      key: argument.value,
      ...(defaultValue !== undefined ? { defaultValue } : {}),
      line: argument.line,
    },
  };
}

function collectExtracted(reading: CallSiteReading, state: CallSiteState): void {
  if (reading.kind === "static") {
    state.calls.push(reading.site);
  } else {
    state.dynamic.push({ line: reading.line });
  }
}

function collectUsage(reading: CallSiteReading, state: CallSiteState): void {
  const line = reading.kind === "static" ? reading.site.line : reading.line;
  if (reading.kind === "static") {
    state.references.push({ key: reading.site.key, line });
  } else if (reading.kind === "named") {
    state.references.push(...reading.keys.map((key) => ({ key, line })));
  } else if (reading.kind === "prefix") {
    state.prefixes.push(...reading.prefixes.map((prefix) => ({ prefix, line })));
  } else {
    state.usageDynamic.push({ line });
  }
}

function byLine<T extends { readonly line: number }>(sites: readonly T[]): T[] {
  return [...sites].sort((left, right) => left.line - right.line);
}

function withKeyPrefixes<T>(
  found: readonly T[],
  sites: KeyUsageSites,
  prefix: (site: T, keyPrefix: string) => T,
): T[] {
  return [
    ...found,
    ...sites.keyPrefixes.flatMap((keyPrefix) => found.map((site) => prefix(site, keyPrefix))),
  ];
}

export function findCallSites(content: string, rules: CallSiteRules): FileExtraction {
  const { tokens, truncated } = tokenizeSource(content);
  const sites = readKeyUsageSites(tokens, rules);
  const sources = readTranslateSources(tokens, rules);
  const state: CallSiteState = {
    calls: [],
    dynamic: [],
    references: [],
    usageDynamic: [],
    prefixes: [],
  };
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokenAt(tokens, index);
    const extracted = token?.kind === "ident" && rules.calleeNames.has(token.value);
    const aliased =
      token?.kind === "ident" &&
      (sites.callees.has(token.value) || sources.identifiers.has(token.value));
    const reading = extracted || aliased ? callSiteAt(tokens, index, rules) : undefined;
    if (reading === undefined) {
      continue;
    }
    if (extracted) {
      collectExtracted(reading, state);
    }
    collectUsage(reading, state);
  }
  return {
    calls: state.calls,
    dynamic: state.dynamic,
    usage: {
      references: withKeyPrefixes(
        byLine([...state.references, ...sites.references]),
        sites,
        (site, keyPrefix) => ({ key: prefixedKey(keyPrefix, site.key, rules), line: site.line }),
      ),
      dynamic: state.usageDynamic,
      prefixes: withKeyPrefixes(state.prefixes, sites, (site, keyPrefix) => ({
        prefix: prefixedKey(keyPrefix, site.prefix, rules),
        line: site.line,
      })),
      unresolved: byLine([...sites.unresolved, ...sources.unresolved]),
    },
    ...(truncated ? { truncated } : {}),
  };
}
