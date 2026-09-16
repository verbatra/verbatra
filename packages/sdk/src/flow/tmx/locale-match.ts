export type LanguageTagMatch =
  | { readonly kind: "matched"; readonly locale: string }
  | { readonly kind: "ambiguous"; readonly candidates: readonly string[] }
  | { readonly kind: "unmatched" };

function canonical(tag: string): string {
  return tag.trim().toLowerCase().replaceAll("_", "-");
}

function primarySubtag(tag: string): string {
  return canonical(tag).split("-")[0] ?? "";
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
    return { kind: "matched", locale: exact };
  }
  const language = primarySubtag(tag);
  const candidates = locales.filter((locale) => primarySubtag(locale) === language);
  if (candidates.length === 1 && candidates[0] !== undefined) {
    return { kind: "matched", locale: candidates[0] };
  }
  return candidates.length === 0 ? { kind: "unmatched" } : { kind: "ambiguous", candidates };
}
