import { Fragment, type ReactNode } from "react";
import { groupWordSegments, KANA, SPACELESS_SCRIPT } from "@/lib/word-count";

const WORD_SEGMENTERS: Partial<Record<"zh" | "ja", Intl.Segmenter>> = {};

function segmenterFor(language: "zh" | "ja"): Intl.Segmenter {
  const known = WORD_SEGMENTERS[language];
  if (known) return known;
  const created = new Intl.Segmenter(language, { granularity: "word" });
  WORD_SEGMENTERS[language] = created;
  return created;
}

export function breakBetweenWords(node: ReactNode): ReactNode {
  if (Array.isArray(node)) {
    return node.map((part, index) => (
      <Fragment key={`part-${index}`}>{breakBetweenWords(part)}</Fragment>
    ));
  }
  if (typeof node !== "string" || !SPACELESS_SCRIPT.test(node)) return node;
  if (typeof Intl.Segmenter !== "function") return node;
  const segmenter = segmenterFor(KANA.test(node) ? "ja" : "zh");
  const groups = groupWordSegments(segmenter.segment(node));
  return groups.map((group, index) => {
    const previous = groups[index - 1];
    const breakBefore = previous?.isWordLike === true && group.isWordLike;
    return (
      <Fragment key={`${index}-${group.text}`}>
        {breakBefore ? <wbr /> : null}
        {group.text}
      </Fragment>
    );
  });
}
