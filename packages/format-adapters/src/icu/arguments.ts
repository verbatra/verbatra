import { type MessageFormatElement, parse, TYPE } from "@formatjs/icu-messageformat-parser";

export type IcuArgumentKind =
  | "argument"
  | "number"
  | "date"
  | "time"
  | "select"
  | "plural"
  | "selectordinal";

export interface IcuMessageArgument {
  readonly name: string;
  readonly kinds: readonly IcuArgumentKind[];
  readonly required: boolean;
}

export type IcuMessageArguments =
  | { readonly valid: true; readonly arguments: readonly IcuMessageArgument[] }
  | { readonly valid: false };

interface CollectedArgument {
  readonly kinds: IcuArgumentKind[];
  required: boolean;
}

type Collection = Map<string, CollectedArgument>;

function argumentOf(
  element: MessageFormatElement,
): { readonly name: string; readonly kind: IcuArgumentKind } | undefined {
  switch (element.type) {
    case TYPE.argument:
      return { name: element.value, kind: "argument" };
    case TYPE.number:
      return { name: element.value, kind: "number" };
    case TYPE.date:
      return { name: element.value, kind: "date" };
    case TYPE.time:
      return { name: element.value, kind: "time" };
    case TYPE.select:
      return { name: element.value, kind: "select" };
    case TYPE.plural:
      return {
        name: element.value,
        kind: element.pluralType === "ordinal" ? "selectordinal" : "plural",
      };
    default:
      return undefined;
  }
}

function record(
  target: Collection,
  name: string,
  kinds: readonly IcuArgumentKind[],
  required: boolean,
): void {
  const existing = target.get(name);
  if (existing === undefined) {
    target.set(name, { kinds: [...kinds], required });
    return;
  }
  for (const kind of kinds) {
    if (!existing.kinds.includes(kind)) {
      existing.kinds.push(kind);
    }
  }
  existing.required = existing.required || required;
}

function mergeInto(target: Collection, source: Collection): void {
  for (const [name, argument] of source) {
    record(target, name, argument.kinds, argument.required);
  }
}

function combineBranches(branches: readonly Collection[]): Collection {
  const combined: Collection = new Map();
  for (const branch of branches) {
    mergeInto(combined, branch);
  }
  for (const [name, argument] of combined) {
    argument.required = branches.every((branch) => branch.get(name)?.required === true);
  }
  return combined;
}

function collect(elements: readonly MessageFormatElement[]): Collection {
  const collected: Collection = new Map();
  for (const element of elements) {
    const argument = argumentOf(element);
    if (argument !== undefined) {
      record(collected, argument.name, [argument.kind], true);
    }
    if (element.type === TYPE.tag) {
      mergeInto(collected, collect(element.children));
    } else if (element.type === TYPE.plural || element.type === TYPE.select) {
      const branches = Object.values(element.options).map((option) => collect(option.value));
      mergeInto(collected, combineBranches(branches));
    }
  }
  return collected;
}

export function icuMessageArguments(value: string): IcuMessageArguments {
  if (!value.includes("{") && !value.includes("<")) {
    return { valid: true, arguments: [] };
  }
  let ast: MessageFormatElement[];
  try {
    ast = parse(value);
  } catch {
    return { valid: false };
  }
  return {
    valid: true,
    arguments: [...collect(ast)].map(([name, argument]) => ({
      name,
      kinds: argument.kinds,
      required: argument.required,
    })),
  };
}
