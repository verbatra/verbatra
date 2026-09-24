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

export interface LengthSummary {
  readonly text: string;
  readonly overBudget: boolean;
}

export function lengthSummary(
  comparison: LengthComparison,
  maxLength: number | undefined,
): LengthSummary {
  const count =
    maxLength === undefined
      ? `${comparison.translation} ${comparison.translation === 1 ? "character" : "characters"}`
      : `${comparison.translation} of ${maxLength} characters`;
  const ratio =
    comparison.percentOfSource === null ? "" : `, ${comparison.percentOfSource}% of source`;
  const overBudget = maxLength !== undefined && comparison.translation > maxLength;
  return { text: `${count}${ratio}${overBudget ? ", over budget" : ""}`, overBudget };
}
