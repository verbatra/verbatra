import { type MessageFormatElement, parse, TYPE } from "@formatjs/icu-messageformat-parser";
import { icuRefusal } from "./limits.js";

export type IcuAxisKind = "plural" | "ordinal" | "select";

export interface IcuVariationAxis {
  readonly argument: string;
  readonly kind: IcuAxisKind;
  readonly offset: number;
  readonly exact: readonly number[];
  readonly selectors: readonly string[];
}

interface MutableAxis {
  readonly argument: string;
  readonly kind: IcuAxisKind;
  readonly offset: number;
  readonly exact: number[];
  readonly selectors: string[];
}

const EXACT_SELECTOR = /^=(\d+)$/;

function addUnique<T>(target: T[], item: T): void {
  if (!target.includes(item)) {
    target.push(item);
  }
}

function axisFor(
  axes: Map<string, MutableAxis>,
  axis: Omit<MutableAxis, "exact" | "selectors">,
): MutableAxis {
  const id = `${axis.kind}:${axis.argument}`;
  const existing = axes.get(id);
  if (existing !== undefined) {
    return existing;
  }
  const created: MutableAxis = { ...axis, exact: [], selectors: [] };
  axes.set(id, created);
  return created;
}

function recordPlural(axes: Map<string, MutableAxis>, element: MessageFormatElement): void {
  if (element.type !== TYPE.plural) {
    return;
  }
  const axis = axisFor(axes, {
    argument: element.value,
    kind: element.pluralType === "ordinal" ? "ordinal" : "plural",
    offset: element.offset,
  });
  for (const selector of Object.keys(element.options)) {
    const exact = EXACT_SELECTOR.exec(selector)?.[1];
    if (exact !== undefined) {
      addUnique(axis.exact, Number(exact));
    }
  }
}

function recordSelect(axes: Map<string, MutableAxis>, element: MessageFormatElement): void {
  if (element.type !== TYPE.select) {
    return;
  }
  const axis = axisFor(axes, { argument: element.value, kind: "select", offset: 0 });
  for (const selector of Object.keys(element.options)) {
    addUnique(axis.selectors, selector);
  }
}

function childElements(element: MessageFormatElement): readonly MessageFormatElement[] {
  if (element.type === TYPE.plural || element.type === TYPE.select) {
    return Object.values(element.options).flatMap((option) => option.value);
  }
  return element.type === TYPE.tag ? element.children : [];
}

function walk(elements: readonly MessageFormatElement[], axes: Map<string, MutableAxis>): void {
  for (const element of elements) {
    recordPlural(axes, element);
    recordSelect(axes, element);
    walk(childElements(element), axes);
  }
}

export function icuVariationAxes(value: string): readonly IcuVariationAxis[] {
  if (icuRefusal(value) !== undefined || !value.includes("{")) {
    return [];
  }
  try {
    const axes = new Map<string, MutableAxis>();
    walk(parse(value), axes);
    return [...axes.values()];
  } catch {
    return [];
  }
}
