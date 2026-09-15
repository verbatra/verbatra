/**
 * What a message argument accepts, as far as the source format records it. `unknown` is not a
 * failure: most formats name their arguments without saying what may be passed for them, and
 * reporting that honestly is better than asserting a type the catalog never carried.
 */
export type MessageArgumentType = "string" | "number" | "unknown";

/** One argument a message interpolates by name. */
export interface NamedMessageArgument {
  /** The name exactly as the format spells it, which need not be a valid identifier. */
  readonly name: string;
  /** What the argument accepts, as far as the format records it. */
  readonly type: MessageArgumentType;
}

/** Why verbatra declined to describe a message's arguments rather than guessing at them. */
export type UnresolvedArgumentReason = "invalid-message-syntax" | "mixed-argument-styles";

/**
 * How a message takes its arguments. A format either names them, numbers them, or takes none; a
 * message that appears to do two of those at once is reported as unresolved rather than flattened
 * into whichever reading happens to be listed first.
 */
export type MessageArguments =
  | {
      /** The message interpolates nothing. */
      readonly style: "none";
    }
  | {
      /** The message interpolates arguments by name. */
      readonly style: "named";
      /** The arguments, in the order the message first mentions them, each name appearing once. */
      readonly named: readonly NamedMessageArgument[];
    }
  | {
      /** The message interpolates arguments by position. */
      readonly style: "positional";
      /** What each position accepts, indexed from zero. */
      readonly positional: readonly MessageArgumentType[];
    }
  | {
      /** The message's arguments could not be determined. */
      readonly style: "unresolved";
      /** Why they could not be determined. */
      readonly reason: UnresolvedArgumentReason;
    };

type ClassifiedToken =
  | { readonly kind: "ignored" }
  | { readonly kind: "named"; readonly name: string; readonly type: MessageArgumentType }
  | { readonly kind: "indexed"; readonly index: number; readonly type: MessageArgumentType }
  | { readonly kind: "anonymous"; readonly type: MessageArgumentType };

const IGNORED: ClassifiedToken = { kind: "ignored" };

const DOUBLE_BRACE = /^\{\{([\s\S]*)\}\}$/;

const SINGLE_BRACE = /^\{([\s\S]*)\}$/;

const COMPOSITE_ITEM = /^(\d+)(?:,(-?\d+))?(?::([\s\S]*))?$/;

const GETTEXT_NAMED = /^%\((\w+)\)([A-Za-z])$/;

const PRINTF_NUMBERED = /^%(\d+)\$([\s\S])$/;

const PRINTF_PLAIN = /^%([\s\S])$/;

const ALL_DIGITS = /^\d+$/;

const NUMERIC_CONVERSIONS = new Set([
  "d",
  "i",
  "u",
  "x",
  "X",
  "o",
  "f",
  "F",
  "e",
  "E",
  "g",
  "G",
  "b",
  "B",
]);

const TEXT_CONVERSIONS = new Set(["s", "S", "c", "C"]);

const NUMERIC_ARGUMENT_TYPES = new Set(["number", "plural", "selectordinal", "choice"]);

function conversionType(conversion: string): MessageArgumentType {
  if (NUMERIC_CONVERSIONS.has(conversion)) {
    return "number";
  }
  return TEXT_CONVERSIONS.has(conversion) ? "string" : "unknown";
}

function annotatedType(annotation: string | undefined): MessageArgumentType {
  if (annotation === undefined) {
    return "unknown";
  }
  return NUMERIC_ARGUMENT_TYPES.has(annotation.trim()) ? "number" : "unknown";
}

function classifyBraceArgument(inner: string): ClassifiedToken {
  const composite = COMPOSITE_ITEM.exec(inner.trim());
  if (composite?.[1] !== undefined) {
    return { kind: "indexed", index: Number(composite[1]), type: "unknown" };
  }
  const comma = inner.indexOf(",");
  const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
  if (name === "") {
    return IGNORED;
  }
  const type = annotatedType(comma === -1 ? undefined : inner.slice(comma + 1).split(",")[0]);
  if (ALL_DIGITS.test(name)) {
    return { kind: "indexed", index: Number(name), type };
  }
  return { kind: "named", name, type };
}

function classifyPrintfToken(token: string): ClassifiedToken {
  const named = GETTEXT_NAMED.exec(token);
  if (named?.[1] !== undefined && named[2] !== undefined) {
    return { kind: "named", name: named[1], type: conversionType(named[2]) };
  }
  const numbered = PRINTF_NUMBERED.exec(token);
  if (numbered?.[1] !== undefined && numbered[2] !== undefined) {
    return { kind: "indexed", index: Number(numbered[1]) - 1, type: conversionType(numbered[2]) };
  }
  const plain = PRINTF_PLAIN.exec(token);
  if (plain?.[1] !== undefined) {
    return { kind: "anonymous", type: conversionType(plain[1]) };
  }
  return IGNORED;
}

function classifyToken(token: string): ClassifiedToken {
  if (token === "%%" || token.startsWith("<") || token.startsWith("$t(")) {
    return IGNORED;
  }
  const doubleBrace = DOUBLE_BRACE.exec(token);
  if (doubleBrace?.[1] !== undefined) {
    return classifyBraceArgument(doubleBrace[1]);
  }
  const singleBrace = SINGLE_BRACE.exec(token);
  if (singleBrace?.[1] !== undefined) {
    return classifyBraceArgument(singleBrace[1]);
  }
  if (token.startsWith("%")) {
    return classifyPrintfToken(token);
  }
  return IGNORED;
}

function mergeType(
  existing: MessageArgumentType | undefined,
  incoming: MessageArgumentType,
): MessageArgumentType {
  if (existing === undefined || existing === incoming) {
    return incoming;
  }
  return "unknown";
}

function namedArguments(tokens: readonly ClassifiedToken[]): MessageArguments {
  const types = new Map<string, MessageArgumentType>();
  for (const token of tokens) {
    if (token.kind === "named") {
      types.set(token.name, mergeType(types.get(token.name), token.type));
    }
  }
  return {
    style: "named",
    named: [...types].map(([name, type]) => ({ name, type })),
  };
}

function positionalArguments(tokens: readonly ClassifiedToken[]): MessageArguments {
  const slots: MessageArgumentType[] = [];
  for (const token of tokens) {
    if (token.kind === "anonymous") {
      slots.push(token.type);
    } else if (token.kind === "indexed") {
      slots[token.index] = mergeType(slots[token.index], token.type);
    }
  }
  return {
    style: "positional",
    positional: Array.from(slots, (slot: MessageArgumentType | undefined) => slot ?? "unknown"),
  };
}

/**
 * Describe the arguments a message takes, from the placeholder tokens the format adapter already
 * extracted from it. Nothing here re-parses the message: the token list is the adapter's own output
 * in document order, and this only reads the shape of each token.
 *
 * @param placeholders - The adapter's placeholder tokens for one message, in document order.
 * @returns How the message takes its arguments, or why that could not be determined.
 */
export function describeMessageArguments(placeholders: readonly string[]): MessageArguments {
  const tokens = placeholders.map(classifyToken).filter((token) => token.kind !== "ignored");
  if (tokens.length === 0) {
    return { style: "none" };
  }
  const named = tokens.some((token) => token.kind === "named");
  const indexed = tokens.some((token) => token.kind === "indexed");
  const anonymous = tokens.some((token) => token.kind === "anonymous");
  if ((named && (indexed || anonymous)) || (indexed && anonymous)) {
    return { style: "unresolved", reason: "mixed-argument-styles" };
  }
  return named ? namedArguments(tokens) : positionalArguments(tokens);
}
