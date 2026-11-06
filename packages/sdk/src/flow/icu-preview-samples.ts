import type { PluralCategory, PluralRuleType } from "@verbatra/core";

const WHOLE_NUMBER_LIMIT = 200;

const CANDIDATE_SAMPLES: readonly number[] = [
  ...Array.from({ length: WHOLE_NUMBER_LIMIT - 1 }, (_unused, index) => index + 1),
  0,
  0.5,
  1.5,
  2.5,
  1_000_000,
  2_000_000,
  1_000_000_000,
];

export const NUMBER_ARGUMENT_SAMPLE = 1234.5;

export interface PluralSampleRequest {
  readonly locale: string;
  readonly ruleType: PluralRuleType;
  readonly offset: number;
  readonly avoid: ReadonlySet<number>;
  readonly categories: readonly PluralCategory[];
}

export interface PluralSamples {
  readonly samples: ReadonlyMap<PluralCategory, number>;
  readonly unreached: readonly PluralCategory[];
}

export function pluralSamples(request: PluralSampleRequest): PluralSamples {
  const rules = new Intl.PluralRules(request.locale, { type: request.ruleType });
  const wanted = new Set<string>(request.categories);
  const reached = new Set<string>();
  const samples = new Map<PluralCategory, number>();
  for (const step of CANDIDATE_SAMPLES) {
    const sample = request.offset + step;
    const category = rules.select(sample - request.offset);
    if (wanted.has(category)) {
      reached.add(category);
      if (!samples.has(category as PluralCategory) && !request.avoid.has(sample)) {
        samples.set(category as PluralCategory, sample);
      }
    }
    if (reached.size === wanted.size && samples.size === wanted.size) {
      break;
    }
  }
  return {
    samples,
    unreached: request.categories.filter((category) => !reached.has(category)),
  };
}
