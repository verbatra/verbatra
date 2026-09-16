import type { PositionedScan, PositionedToken } from "../scan/tokenize.js";
import { isPunct } from "./literal-frames.js";

const IGNORE_NEXT_LINE = /verbatra-ignore-next-line(?![\w-])/;

const IGNORE_LINE = /verbatra-ignore-line(?![\w-])/;

interface TokenRange {
  readonly first: number;
  readonly last: number;
}

export type DirectiveCheck = (token: PositionedToken, index: number) => boolean;

function elementEnd(tokens: readonly PositionedToken[], openIndex: number): number {
  let depth = 0;
  for (let index = openIndex; index < tokens.length; index += 1) {
    const kind = tokens[index]?.kind;
    if (kind === "markup-open") {
      depth += 1;
    } else if (kind === "markup-close") {
      depth -= 1;
    }
    if (depth === 0) {
      return index;
    }
  }
  return tokens.length - 1;
}

function bracedEnd(tokens: readonly PositionedToken[], braceIndex: number): number {
  let depth = 0;
  for (let index = braceIndex; index < tokens.length; index += 1) {
    const token = tokens[index];
    depth += isPunct(token, "{") ? 1 : 0;
    depth -= isPunct(token, "}") ? 1 : 0;
    if (depth === 0) {
      return index;
    }
  }
  return tokens.length - 1;
}

function attributeValueEnd(tokens: readonly PositionedToken[], valueIndex: number): number {
  const value = tokens[valueIndex];
  if (value?.kind === "markup-open") {
    return elementEnd(tokens, valueIndex);
  }
  return isPunct(value, "{") ? bracedEnd(tokens, valueIndex) : valueIndex;
}

function openingTagEnd(tokens: readonly PositionedToken[], openIndex: number): number {
  let last = openIndex;
  while (tokens[last + 1]?.kind === "markup-attribute") {
    last = attributeValueEnd(tokens, last + 2);
  }
  return last;
}

function directiveLines(scan: PositionedScan): { lines: Set<number>; nextLineAfter: number[] } {
  const lines = new Set<number>();
  const nextLineAfter: number[] = [];
  for (const comment of scan.comments) {
    if (IGNORE_NEXT_LINE.test(comment.text)) {
      nextLineAfter.push(comment.endLine);
    } else if (IGNORE_LINE.test(comment.text)) {
      lines.add(comment.line);
    }
  }
  nextLineAfter.sort((left, right) => left - right);
  return { lines, nextLineAfter };
}

function addOpeningTagRanges(
  tokens: readonly PositionedToken[],
  lineStart: number,
  ranges: TokenRange[],
): void {
  const line = tokens[lineStart]?.line;
  for (let index = lineStart; tokens[index]?.line === line; index += 1) {
    const covered = (ranges[ranges.length - 1]?.last ?? -1) >= index;
    if (tokens[index]?.kind === "markup-open" && !covered) {
      ranges.push({ first: index, last: openingTagEnd(tokens, index) });
    }
  }
}

function isInRanges(ranges: readonly TokenRange[], index: number): boolean {
  let low = 0;
  let high = ranges.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const range = ranges[middle] ?? { first: 0, last: -1 };
    if (index < range.first) {
      high = middle - 1;
    } else if (index > range.last) {
      low = middle + 1;
    } else {
      return true;
    }
  }
  return false;
}

export function directiveSuppression(scan: PositionedScan): DirectiveCheck {
  const { tokens } = scan;
  const { lines, nextLineAfter } = directiveLines(scan);
  const ranges: TokenRange[] = [];
  let lineStart = 0;
  let targeted: number | undefined;
  for (const endLine of nextLineAfter) {
    while ((tokens[lineStart]?.line ?? Number.POSITIVE_INFINITY) <= endLine) {
      lineStart += 1;
    }
    const line = tokens[lineStart]?.line;
    if (line !== undefined && line !== targeted) {
      targeted = line;
      lines.add(line);
      addOpeningTagRanges(tokens, lineStart, ranges);
    }
  }
  return (token, index) => lines.has(token.line) || isInRanges(ranges, index);
}
