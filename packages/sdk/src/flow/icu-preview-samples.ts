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

export function pluralSamples(request: PluralSampleRequest): ReadonlyMap<PluralCategory, number> {
  const rules = new Intl.PluralRules(request.locale, { type: request.ruleType });
  const wanted = new Set<string>(request.categories);
  const found = new Map<PluralCategory, number>();
  for (const candidate of CANDIDATE_SAMPLES) {
    if (request.avoid.has(candidate)) {
      continue;
    }
    const category = rules.select(candidate - request.offset) as PluralCategory;
    if (wanted.has(category) && !found.has(category)) {
      found.set(category, candidate);
    }
    if (found.size === wanted.size) {
      break;
    }
  }
  return found;
}
