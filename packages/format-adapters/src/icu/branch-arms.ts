import {
  type MessageFormatElement,
  type PluralElement,
  parse,
  type SelectElement,
  TYPE,
} from "@formatjs/icu-messageformat-parser";
import { PLURAL_CATEGORIES } from "@verbatra/core";
import type { PluralCategoryLookup } from "../shell.js";
import {
  type BranchingElement,
  findMatchingBranching,
  findMatchingTag,
  isBranching,
  isTag,
} from "./compare.js";

const ANY_CATEGORY: ReadonlySet<string> = new Set(PLURAL_CATEGORIES);
const REQUIRED_WITHOUT_RULES: readonly string[] = ["other"];

type Problems = Set<string>;

function kindOf(element: BranchingElement): string {
  if (element.type === TYPE.select) {
    return "select";
  }
  return element.pluralType === "ordinal" ? "selectordinal" : "plural";
}

function selectorsOf(element: BranchingElement): readonly string[] {
  return Object.keys(element.options);
}

function hasArm(element: BranchingElement, selector: string): boolean {
  return Object.hasOwn(element.options, selector);
}

function isExactSelector(selector: string): boolean {
  return selector.startsWith("=");
}

function describe(element: BranchingElement): string {
  return `{${element.value}} ${kindOf(element)}`;
}

function checkPluralArms(
  source: PluralElement,
  target: PluralElement,
  lookup: PluralCategoryLookup,
  problems: Problems,
): void {
  const label = describe(source);
  if (target.offset !== source.offset) {
    problems.add(`${label}: offset ${source.offset} became ${target.offset}`);
  }
  const categories = lookup(source.pluralType === "ordinal" ? "ordinal" : "cardinal");
  const allowed: ReadonlySet<string> =
    categories === undefined ? ANY_CATEGORY : new Set(categories);
  for (const category of categories ?? REQUIRED_WITHOUT_RULES) {
    if (!hasArm(target, category)) {
      problems.add(`${label}: missing arm "${category}" required by the target language`);
    }
  }
  for (const selector of selectorsOf(target)) {
    if (!isExactSelector(selector) && !allowed.has(selector)) {
      problems.add(
        `${label}: arm ${JSON.stringify(selector)} is not a plural category of the target language`,
      );
    }
  }
  for (const selector of selectorsOf(source)) {
    if (isExactSelector(selector) && !hasArm(target, selector)) {
      problems.add(`${label}: missing exact-value arm "${selector}"`);
    }
  }
}

function checkSelectArms(source: SelectElement, target: SelectElement, problems: Problems): void {
  const label = describe(source);
  for (const selector of selectorsOf(source)) {
    if (!hasArm(target, selector)) {
      problems.add(`${label}: missing arm ${JSON.stringify(selector)}`);
    }
  }
  for (const selector of selectorsOf(target)) {
    if (!hasArm(source, selector)) {
      problems.add(`${label}: arm ${JSON.stringify(selector)} is not in the source`);
    }
  }
}

function sourceArmFor(source: BranchingElement, selector: string): readonly MessageFormatElement[] {
  return source.options[hasArm(source, selector) ? selector : "other"]?.value ?? [];
}

function checkBranching(
  source: BranchingElement,
  target: BranchingElement,
  lookup: PluralCategoryLookup,
  problems: Problems,
): void {
  if (
    source.type === TYPE.plural &&
    target.type === TYPE.plural &&
    source.pluralType === target.pluralType
  ) {
    checkPluralArms(source, target, lookup, problems);
  } else if (source.type === TYPE.select && target.type === TYPE.select) {
    checkSelectArms(source, target, problems);
  } else {
    problems.add(`${describe(source)}: became a ${kindOf(target)}`);
    return;
  }
  for (const [selector, arm] of Object.entries(target.options)) {
    checkElements(sourceArmFor(source, selector), arm.value, lookup, problems);
  }
}

function checkElements(
  source: readonly MessageFormatElement[],
  target: readonly MessageFormatElement[],
  lookup: PluralCategoryLookup,
  problems: Problems,
): void {
  const consumed = new Set<number>();
  for (const element of source) {
    if (isBranching(element)) {
      const found = findMatchingBranching(element, target, consumed);
      if (found !== undefined) {
        consumed.add(found.index);
        checkBranching(element, found.element, lookup, problems);
      }
    } else if (isTag(element)) {
      const found = findMatchingTag(element, target, consumed);
      if (found !== undefined) {
        consumed.add(found.index);
        checkElements(element.children, found.element.children, lookup, problems);
      }
    }
  }
}

export function compareIcuBranchArms(
  sourceValue: string,
  targetValue: string,
  pluralCategories: PluralCategoryLookup,
): readonly string[] {
  let sourceAst: MessageFormatElement[];
  let targetAst: MessageFormatElement[];
  try {
    sourceAst = parse(sourceValue);
    targetAst = parse(targetValue);
  } catch {
    return [];
  }
  const problems: Problems = new Set();
  checkElements(sourceAst, targetAst, pluralCategories, problems);
  return [...problems];
}
