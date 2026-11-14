const SPACELESS_LANGUAGES: ReadonlySet<string> = new Set(["zh", "ja", "th", "lo", "km", "my"]);

export function isSpaceless(locale: string): boolean {
  return SPACELESS_LANGUAGES.has(new Intl.Locale(locale).language);
}

export function countWords(text: string, locale: string): number {
  if (!isSpaceless(locale)) return text.split(/\s+/).filter((word) => word !== "").length;
  const segmenter = new Intl.Segmenter(locale, { granularity: "word" });
  let count = 0;
  for (const segment of segmenter.segment(text)) if (segment.isWordLike) count += 1;
  return count;
}
