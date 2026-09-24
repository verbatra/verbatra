const GRAPHEMES = new Intl.Segmenter(undefined, { granularity: "grapheme" });

export function characterCount(text: string): number {
  return [...GRAPHEMES.segment(text)].length;
}

export interface LengthComparison {
  readonly source: number;
  readonly translation: number;
  readonly percentOfSource: number | null;
}

export function compareLength(source: string, translation: string): LengthComparison {
  const sourceCount = characterCount(source);
  const translationCount = characterCount(translation);
  return {
    source: sourceCount,
    translation: translationCount,
    percentOfSource: sourceCount === 0 ? null : Math.round((translationCount / sourceCount) * 100),
  };
}

function characters(count: number): string {
  return `${count} ${count === 1 ? "character" : "characters"}`;
}

export function lengthComparisonText(comparison: LengthComparison): string {
  if (comparison.percentOfSource === null) {
    return `${characters(comparison.translation)}; the source is empty`;
  }
  return `${characters(comparison.translation)}, ${comparison.percentOfSource}% of the source's ${comparison.source}`;
}
