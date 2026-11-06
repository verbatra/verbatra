import { type IcuAxisKind, type IcuAxisStep, icuExactArmValue } from "@verbatra/format-adapters";
import { CANDIDATE_SAMPLES, WHOLE_CANDIDATES } from "./icu-preview-samples.js";

export type PreviewSample = string | number;

export interface ArmConstraint {
  readonly step: IcuAxisStep;
  readonly byCategory: boolean;
}

export type Solution = ReadonlyMap<string, PreviewSample>;

export type Solver = (constraints: readonly ArmConstraint[]) => Solution | undefined;

export function ruleTypeOf(kind: IcuAxisKind): "cardinal" | "ordinal" {
  return kind === "ordinal" ? "ordinal" : "cardinal";
}

function createCategoryOf(locale: string): (step: IcuAxisStep, count: number) => string {
  const cache = new Map<string, Intl.PluralRules>();
  return (step, count) => {
    const type = ruleTypeOf(step.kind);
    let rules = cache.get(type);
    if (rules === undefined) {
      rules = new Intl.PluralRules(locale, { type });
      cache.set(type, rules);
    }
    return rules.select(count - step.offset);
  };
}

export function exactValuesOf(options: readonly string[]): readonly number[] {
  return options.flatMap((option) => {
    const value = icuExactArmValue(option);
    return value === undefined ? [] : [value];
  });
}

function candidatesFor(constraints: readonly ArmConstraint[]): readonly PreviewSample[] {
  const strings = constraints.flatMap(({ step }) =>
    step.kind === "select" ? [step.selector, ...step.options] : [],
  );
  const numeric = constraints.filter(({ step }) => step.kind !== "select");
  const offsets = new Set(numeric.map(({ step }) => step.offset));
  const counts = [
    ...[...offsets].flatMap((offset) => CANDIDATE_SAMPLES.map((count) => count + offset)),
    0,
    ...WHOLE_CANDIDATES,
  ];
  const exact = numeric.flatMap(({ step }) => exactValuesOf(step.options));
  return [...new Set<PreviewSample>([...strings, ...counts, ...exact])];
}

export function createSolver(locale: string): Solver {
  const categoryOf = createCategoryOf(locale);

  function pluralSelected(constraint: ArmConstraint, sample: number, lenient: boolean): boolean {
    const { step, byCategory } = constraint;
    const exactKey = `=${sample}`;
    if (step.options.includes(exactKey)) {
      return !byCategory && step.selector === exactKey;
    }
    const category = categoryOf(step, sample);
    if (byCategory) {
      const falls = lenient && step.selector === "other" && !step.options.includes(category);
      return category === step.selector || falls;
    }
    return (step.options.includes(category) ? category : "other") === step.selector;
  }

  function selected(constraint: ArmConstraint, sample: PreviewSample, lenient: boolean): boolean {
    const { step, byCategory } = constraint;
    if (step.kind === "select") {
      const key = String(sample);
      return (step.options.includes(key) ? key : "other") === step.selector;
    }
    if (typeof sample !== "number") {
      return (lenient || !byCategory) && step.selector === "other";
    }
    return pluralSelected(constraint, sample, lenient);
  }

  return (constraints) => {
    const byArgument = new Map<string, ArmConstraint[]>();
    for (const constraint of constraints) {
      const list = byArgument.get(constraint.step.argument) ?? [];
      list.push(constraint);
      byArgument.set(constraint.step.argument, list);
    }
    const solution = new Map<string, PreviewSample>();
    for (const [argument, list] of byArgument) {
      const candidates = candidatesFor(list);
      const sample = [false, true]
        .map((lenient) =>
          candidates.find((candidate) =>
            list.every((constraint) => selected(constraint, candidate, lenient)),
          ),
        )
        .find((found) => found !== undefined);
      if (sample === undefined) {
        return undefined;
      }
      solution.set(argument, sample);
    }
    return solution;
  };
}
