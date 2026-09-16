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
  const candidates = locales.filter((locale) =>
    extendsOrIsExtendedBy(subtags, canonical(locale).split("-")),
  );
  if (candidates.length === 1 && candidates[0] !== undefined) {
    return { kind: "matched", locale: candidates[0], exact: false };
  }
  return candidates.length === 0 ? { kind: "unmatched" } : { kind: "ambiguous", candidates };
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
