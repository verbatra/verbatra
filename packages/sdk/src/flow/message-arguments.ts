import {
  type IcuArgumentKind,
  type IcuMessageArgument,
  icuMessageArguments,
} from "@verbatra/format-adapters";

export type MessageArgumentType = "string" | "number" | "date" | "unknown";

export interface NamedMessageArgument {
  readonly name: string;
  readonly type: MessageArgumentType;
  readonly optional?: boolean;
}

/** Why verbatra declined to describe a message's arguments rather than guessing at them. */
export type UnresolvedArgumentReason =
  | "invalid-message-syntax"
  | "mixed-argument-styles"
  | "argument-index-out-of-range";

export type MessageArguments =
  | {
      readonly style: "none";
    }
  | {
      readonly style: "named";
      readonly named: readonly NamedMessageArgument[];
    }
  | {
      readonly style: "positional";
      readonly positional: readonly MessageArgumentType[];
    }
  | {
      readonly style: "unresolved";
      readonly reason: UnresolvedArgumentReason;
    };

type ClassifiedToken =
  | { readonly kind: "ignored" }
  | {
      readonly kind: "named";
      readonly name: string;
      readonly type: MessageArgumentType;
      readonly optional?: boolean;
    }
  | { readonly kind: "indexed"; readonly index: number; readonly type: MessageArgumentType }
  | { readonly kind: "anonymous"; readonly type: MessageArgumentType };

const IGNORED: ClassifiedToken = { kind: "ignored" };

const DOUBLE_BRACE = /^\{\{([\s\S]*)\}\}$/;

const SINGLE_BRACE = /^\{([\s\S]*)\}$/;

const I18NEXT_UNESCAPE_PREFIX = /^\s*-\s*/;

const COMPOSITE_ITEM = /^(\d+)(?:,(-?\d+))?(?::([\s\S]*))?$/;

const GETTEXT_NAMED = /^%\((\w+)\)([A-Za-z])$/;

const PRINTF_NUMBERED = /^%(\d+)\$([\s\S])$/;

const PRINTF_PLAIN = /^%([\s\S])$/;

const ALL_DIGITS = /^\d+$/;

const MAX_POSITIONAL_ARGUMENTS = 64;

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

const DOUBLE_BRACE_DATE_FORMATS = new Set(["datetime"]);

const ICU_KIND_TYPES: Readonly<Record<IcuArgumentKind, MessageArgumentType>> = {
  argument: "unknown",
  number: "number",
  plural: "number",
  selectordinal: "number",
  date: "date",
  time: "date",
  select: "string",
};

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

function formatterName(annotation: string): string {
  const options = annotation.indexOf("(");
  return (options === -1 ? annotation : annotation.slice(0, options)).trim();
}

function doubleBraceType(annotation: string | undefined): MessageArgumentType {
  if (annotation !== undefined && DOUBLE_BRACE_DATE_FORMATS.has(formatterName(annotation))) {
    return "date";
  }
  return annotatedType(annotation === undefined ? undefined : formatterName(annotation));
}

function classifyBraceArgument(
  inner: string,
  typeOf: (annotation: string | undefined) => MessageArgumentType,
): ClassifiedToken {
  const composite = COMPOSITE_ITEM.exec(inner.trim());
  if (composite?.[1] !== undefined) {
    return { kind: "indexed", index: Number(composite[1]), type: "unknown" };
  }
  const comma = inner.indexOf(",");
  const name = (comma === -1 ? inner : inner.slice(0, comma)).trim();
  if (name === "") {
    return IGNORED;
  }
  const type = typeOf(comma === -1 ? undefined : inner.slice(comma + 1).split(",")[0]);
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
    return classifyBraceArgument(
      doubleBrace[1].replace(I18NEXT_UNESCAPE_PREFIX, ""),
      doubleBraceType,
    );
  }
  const singleBrace = SINGLE_BRACE.exec(token);
  if (singleBrace?.[1] !== undefined) {
    return classifyBraceArgument(singleBrace[1], annotatedType);
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
  const named = new Map<string, NamedMessageArgument>();
  for (const token of tokens) {
    if (token.kind === "named") {
      const existing = named.get(token.name);
      const optional =
        token.optional === true && (existing === undefined || existing.optional === true);
      named.set(token.name, {
        name: token.name,
        type: mergeType(existing?.type, token.type),
        ...(optional ? { optional: true } : {}),
      });
    }
  }
  return { style: "named", named: [...named.values()] };
}

function indexOutOfRange(tokens: readonly ClassifiedToken[]): boolean {
  return tokens.some(
    (token) =>
      token.kind === "indexed" && (token.index < 0 || token.index >= MAX_POSITIONAL_ARGUMENTS),
  );
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

function icuArgumentType(kinds: readonly IcuArgumentKind[]): MessageArgumentType {
  return kinds.map((kind) => ICU_KIND_TYPES[kind]).reduce(mergeType);
}

function classifyIcuArgument(argument: IcuMessageArgument): ClassifiedToken {
  const type = icuArgumentType(argument.kinds);
  if (ALL_DIGITS.test(argument.name)) {
    return { kind: "indexed", index: Number(argument.name), type };
  }
  return {
    kind: "named",
    name: argument.name,
    type,
    ...(argument.required ? {} : { optional: true }),
  };
}

export function describeMessageArguments(placeholders: readonly string[]): MessageArguments {
  return describeClassifiedTokens(
    placeholders.map(classifyToken).filter((token) => token.kind !== "ignored"),
  );
}

export function describeIcuMessageArguments(value: string): MessageArguments {
  const analysis = icuMessageArguments(value);
  if (!analysis.valid) {
    return { style: "unresolved", reason: "invalid-message-syntax" };
  }
  return describeClassifiedTokens(analysis.arguments.map(classifyIcuArgument));
}

function describeClassifiedTokens(tokens: readonly ClassifiedToken[]): MessageArguments {
  if (tokens.length === 0) {
    return { style: "none" };
  }
  const named = tokens.some((token) => token.kind === "named");
  const indexed = tokens.some((token) => token.kind === "indexed");
  const anonymous = tokens.some((token) => token.kind === "anonymous");
  if ((named && (indexed || anonymous)) || (indexed && anonymous)) {
    return { style: "unresolved", reason: "mixed-argument-styles" };
  }
  if (indexOutOfRange(tokens)) {
    return { style: "unresolved", reason: "argument-index-out-of-range" };
  }
  return named ? namedArguments(tokens) : positionalArguments(tokens);
}
