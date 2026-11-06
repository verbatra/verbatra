import { type MessageFormatElement, TYPE } from "@formatjs/icu-messageformat-parser";

export type IcuAxisKind = "plural" | "ordinal" | "select";

export interface IcuAxisStep {
  readonly argument: string;
  readonly kind: IcuAxisKind;
  readonly offset: number;
  readonly options: readonly string[];
  readonly selector: string;
}

export type IcuAxisPath = readonly IcuAxisStep[];

export interface IcuAxisOccurrence {
  readonly path: IcuAxisPath;
  readonly offset: number;
  readonly options: readonly string[];
}

export interface IcuVariationAxis {
  readonly argument: string;
  readonly kind: IcuAxisKind;
  readonly occurrences: readonly IcuAxisOccurrence[];
}

interface MutableAxis {
  readonly argument: string;
  readonly kind: IcuAxisKind;
  readonly occurrences: IcuAxisOccurrence[];
}

type Branching = Extract<MessageFormatElement, { options: unknown }>;

export function icuExactArmValue(selector: string): number | undefined {
  const digits = /^=(-?\d+)$/.exec(selector)?.[1];
  if (digits === undefined) {
    return undefined;
  }
  const value = Number(digits);
  return selector === `=${value}` ? value : undefined;
}

function kindOf(element: Branching): IcuAxisKind {
  if (element.type === TYPE.select) {
    return "select";
  }
  return element.pluralType === "ordinal" ? "ordinal" : "plural";
}

function offsetOf(element: Branching): number {
  return element.type === TYPE.plural ? element.offset : 0;
}

function recordOccurrence(
  axes: Map<string, MutableAxis>,
  element: Branching,
  path: IcuAxisPath,
): void {
  const kind = kindOf(element);
  const id = `${kind}:${element.value}`;
  const axis = axes.get(id) ?? { argument: element.value, kind, occurrences: [] };
  axes.set(id, axis);
  axis.occurrences.push({
    path,
    offset: offsetOf(element),
    options: Object.keys(element.options),
  });
}

function walk(
  elements: readonly MessageFormatElement[],
  path: IcuAxisPath,
  axes: Map<string, MutableAxis>,
): void {
  for (const element of elements) {
    if (element.type === TYPE.plural || element.type === TYPE.select) {
      recordOccurrence(axes, element, path);
      const options = Object.keys(element.options);
      for (const [selector, option] of Object.entries(element.options)) {
        const step: IcuAxisStep = {
          argument: element.value,
          kind: kindOf(element),
          offset: offsetOf(element),
          options,
          selector,
        };
        walk(option.value, [...path, step], axes);
      }
    } else if (element.type === TYPE.tag) {
      walk(element.children, path, axes);
    }
  }
}

export function icuVariationAxesOf(
  ast: readonly MessageFormatElement[],
): readonly IcuVariationAxis[] {
  const axes = new Map<string, MutableAxis>();
  walk(ast, [], axes);
  return [...axes.values()];
}
