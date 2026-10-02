import { type MessageFormatElement, parse, TYPE } from "@formatjs/icu-messageformat-parser";
import type { PluralRuleType } from "@verbatra/core";

export interface IcuPluralUse {
  readonly argument: string;
  readonly ruleType: PluralRuleType;
  readonly categories: readonly string[];
}

function parseOrUndefined(value: string): MessageFormatElement[] | undefined {
  try {
    return parse(value);
  } catch {
    return undefined;
  }
}

function collectPluralUses(
  elements: readonly MessageFormatElement[],
  uses: IcuPluralUse[],
): IcuPluralUse[] {
  for (const element of elements) {
    if (element.type === TYPE.plural) {
      uses.push({
        argument: element.value,
        ruleType: element.pluralType === "ordinal" ? "ordinal" : "cardinal",
        categories: Object.keys(element.options).filter((selector) => !selector.startsWith("=")),
      });
    }
    if (element.type === TYPE.plural || element.type === TYPE.select) {
      for (const option of Object.values(element.options)) {
        collectPluralUses(option.value, uses);
      }
    } else if (element.type === TYPE.tag) {
      collectPluralUses(element.children, uses);
    }
  }
  return uses;
}

export function icuPluralUses(value: string): readonly IcuPluralUse[] {
  if (!value.includes("{")) {
    return [];
  }
  const ast = parseOrUndefined(value);
  return ast === undefined ? [] : collectPluralUses(ast, []);
}
