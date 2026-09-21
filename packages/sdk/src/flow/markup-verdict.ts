import {
  compareInlineMarkup,
  type InlineMarkupComparison,
  inlineTagToken,
  type TranslationEntry,
} from "@verbatra/core";

export interface MarkupVerdict {
  readonly matches: boolean;
  readonly details: readonly string[];
}

function placeholderTags(placeholders: readonly string[]): readonly string[] {
  const tags: string[] = [];
  for (const placeholder of placeholders) {
    const tag = inlineTagToken(placeholder);
    if (tag !== undefined) {
      tags.push(tag);
    }
  }
  return tags;
}

function detailsOf(comparison: InlineMarkupComparison): readonly string[] {
  if (comparison.tagLimitExceeded !== undefined) {
    return [`+more than ${comparison.tagLimitExceeded} inline tags`];
  }
  return [
    ...comparison.missing.map((token) => `-${token}`),
    ...comparison.extra.map((token) => `+${token}`),
  ];
}

export function judgeEntryMarkup(
  sourceEntry: TranslationEntry,
  candidateValue: string,
): MarkupVerdict {
  const comparison = compareInlineMarkup(sourceEntry.value, candidateValue, {
    ignoreTags: placeholderTags(sourceEntry.placeholders),
  });
  return { matches: comparison.matches, details: detailsOf(comparison) };
}
