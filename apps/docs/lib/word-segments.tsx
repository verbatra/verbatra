import { type CSSProperties, Fragment, type ReactNode } from "react";
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

function wordPieces(text: string): string[] {
  const groups = groupWordSegments(segmenterFor(KANA.test(text) ? "ja" : "zh").segment(text));
  const pieces: string[] = [];
  let carry = "";
  for (const group of groups) {
    if (group.isWordLike) {
      pieces.push(carry + group.text);
      carry = "";
    } else if (pieces.length > 0) {
      pieces[pieces.length - 1] += group.text;
    } else {
      carry += group.text;
    }
  }
  if (carry) pieces.push(carry);
  return pieces;
}

function wordSpan(text: string, index: number): ReactNode {
  return (
    <span className="vk-word" style={{ "--i": index } as CSSProperties}>
      {text}
    </span>
  );
}

function splitSpaceless(text: string): ReactNode {
  const pieces = typeof Intl.Segmenter === "function" ? wordPieces(text) : [text];
  return pieces.map((piece, index) => {
    const word = piece.trimEnd();
    return (
      <Fragment key={`${index}-${piece}`}>
        {index > 0 ? <wbr /> : null}
        {wordSpan(word, index)}
        {piece.slice(word.length)}
      </Fragment>
    );
  });
}

export function splitWords(text: string): ReactNode {
  if (SPACELESS_SCRIPT.test(text)) return splitSpaceless(text);
  let index = 0;
  return text
    .split(/(\s+)/)
    .map((part, position) =>
      part === "" || /^\s+$/.test(part) ? (
        part
      ) : (
        <Fragment key={`${position}-${part}`}>{wordSpan(part, index++)}</Fragment>
      ),
    );
}
