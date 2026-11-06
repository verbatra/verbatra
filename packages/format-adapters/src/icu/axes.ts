import { type MessageFormatElement, TYPE } from "@formatjs/icu-messageformat-parser";

export type IcuAxisKind = "plural" | "ordinal" | "select";

export interface IcuAxisStep {
  readonly argument: string;
  readonly kind: IcuAxisKind;
  readonly selector: string;
}

export type IcuAxisPath = readonly IcuAxisStep[];

export interface IcuAxisArm {
  readonly selector: string;
  readonly path: IcuAxisPath;
}

export interface IcuVariationAxis {
  readonly argument: string;
  readonly kind: IcuAxisKind;
  readonly offset: number;
  readonly path: IcuAxisPath;
  readonly arms: readonly IcuAxisArm[];
}

interface MutableAxis {
  readonly argument: string;
  readonly kind: IcuAxisKind;
  readonly offset: number;
  readonly path: IcuAxisPath;
  readonly arms: IcuAxisArm[];
}

function axisFor(axes: Map<string, MutableAxis>, axis: Omit<MutableAxis, "arms">): MutableAxis {
  const id = `${axis.kind}:${axis.argument}`;
  const existing = axes.get(id);
  if (existing !== undefined) {
    return existing;
  }
  const created: MutableAxis = { ...axis, arms: [] };
  axes.set(id, created);
  return created;
}

type Branching = Extract<MessageFormatElement, { options: unknown }>;

function kindOf(element: Branching): IcuAxisKind {
  if (element.type === TYPE.select) {
    return "select";
  }
  return element.pluralType === "ordinal" ? "ordinal" : "plural";
}

function recordArms(axes: Map<string, MutableAxis>, element: Branching, path: IcuAxisPath): void {
  const axis = axisFor(axes, {
    argument: element.value,
    kind: kindOf(element),
    offset: element.type === TYPE.plural ? element.offset : 0,
    path,
  });
  for (const selector of Object.keys(element.options)) {
    if (!axis.arms.some((arm) => arm.selector === selector)) {
      axis.arms.push({ selector, path });
    }
  }
}

function walk(
  elements: readonly MessageFormatElement[],
  path: IcuAxisPath,
  axes: Map<string, MutableAxis>,
): void {
  for (const element of elements) {
    if (element.type === TYPE.plural || element.type === TYPE.select) {
      recordArms(axes, element, path);
      for (const [selector, option] of Object.entries(element.options)) {
        const step = { argument: element.value, kind: kindOf(element), selector };
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
