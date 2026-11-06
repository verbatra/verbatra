import type { PluralRuleType } from "@verbatra/core";

const WHOLE_NUMBER_LIMIT = 200;

export const WHOLE_CANDIDATES: readonly number[] = Array.from(
  { length: WHOLE_NUMBER_LIMIT - 1 },
  (_unused, index) => index + 1,
);

export const CANDIDATE_SAMPLES: readonly number[] = [
  ...WHOLE_CANDIDATES,
  0,
  0.5,
  1.5,
  2.5,
  1_000_000,
  2_000_000,
  1_000_000_000,
];

export const NUMBER_ARGUMENT_SAMPLE = 1234.5;

export function defaultPluralSample(
  locale: string,
  ruleType: PluralRuleType,
  offset: number,
  avoid: ReadonlySet<number>,
): number {
  const rules = new Intl.PluralRules(locale, { type: ruleType });
  const usable = WHOLE_CANDIDATES.map((count) => count + offset).filter(
    (sample) => !avoid.has(sample),
  );
  const other = usable.find((sample) => rules.select(sample - offset) === "other");
  return other ?? usable.find((sample) => sample - offset >= 2) ?? 2 + offset;
}
