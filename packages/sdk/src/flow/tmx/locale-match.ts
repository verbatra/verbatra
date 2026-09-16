import { SdkError } from "../../errors.js";

export type LanguageTagMatch =
  | { readonly kind: "matched"; readonly locale: string; readonly exact: boolean }
  | { readonly kind: "ambiguous"; readonly candidates: readonly string[] }
  | { readonly kind: "unmatched" };

function canonical(tag: string): string {
  return tag.trim().toLowerCase().replaceAll("_", "-");
}

function isSubtagPrefix(shorter: readonly string[], longer: readonly string[]): boolean {
  return (
    shorter.length < longer.length && shorter.every((subtag, index) => subtag === longer[index])
  );
}

function extendsOrIsExtendedBy(left: readonly string[], right: readonly string[]): boolean {
  return isSubtagPrefix(left, right) || isSubtagPrefix(right, left);
}

interface Candidate {
  readonly locale: string;
  readonly subtags: readonly string[];
}

function liesOnOneChain(candidates: readonly Candidate[]): boolean {
  const byLength = [...candidates].sort(
    (left, right) => left.subtags.length - right.subtags.length,
  );
  return byLength.every((candidate, index) => {
    const longer = byLength[index + 1];
    return longer === undefined || isSubtagPrefix(candidate.subtags, longer.subtags);
  });
}

function nearestOnChain(candidates: readonly Candidate[], length: number): Candidate | undefined {
  const prefixes = candidates.filter((candidate) => candidate.subtags.length < length);
  const pool = prefixes.length > 0 ? prefixes : candidates;
  const distance = (candidate: Candidate): number => Math.abs(candidate.subtags.length - length);
  return pool.reduce<Candidate | undefined>(
    (best, candidate) =>
      best === undefined || distance(candidate) < distance(best) ? candidate : best,
    undefined,
  );
}

export function sameTag(left: string, right: string): boolean {
  return canonical(left) === canonical(right);
}

export function matchLanguageTag(tag: string, locales: readonly string[]): LanguageTagMatch {
  const wanted = canonical(tag);
  if (wanted === "") {
    return { kind: "unmatched" };
  }
  const exact = locales.find((locale) => canonical(locale) === wanted);
  if (exact !== undefined) {
    return { kind: "matched", locale: exact, exact: true };
  }
  const subtags = wanted.split("-");
  const candidates = locales
    .map((locale) => ({ locale, subtags: canonical(locale).split("-") }))
    .filter((candidate) => extendsOrIsExtendedBy(subtags, candidate.subtags));
  if (candidates.length === 0) {
    return { kind: "unmatched" };
  }
  const nearest = liesOnOneChain(candidates)
    ? nearestOnChain(candidates, subtags.length)
    : undefined;
  return nearest === undefined
    ? { kind: "ambiguous", candidates: candidates.map((candidate) => candidate.locale) }
    : { kind: "matched", locale: nearest.locale, exact: false };
}

export function assertDistinctLocales(
  sourceLocale: string,
  targetLocales: readonly string[],
): void {
  const collision = targetLocales.find((locale) => sameTag(locale, sourceLocale));
  if (collision !== undefined) {
    throw new SdkError(
      "CONFIG_INVALID",
      `The target locale "${collision}" and the source locale "${sourceLocale}" are the same language tag once case and separators are normalized, so a TMX segment could not be attributed to either. Spell them differently or drop one.`,
    );
  }
}
