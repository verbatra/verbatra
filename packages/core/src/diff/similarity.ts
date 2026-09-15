import { normalizeText } from "../hash/normalize-text.js";

const UNREACHABLE = 0x3fffffff;

function seedRow(width: number, maxDistance: number): Int32Array<ArrayBuffer> {
  const row = new Int32Array(width);
  for (let column = 0; column < width; column += 1) {
    row[column] = column <= maxDistance ? column : UNREACHABLE;
  }
  return row;
}

interface RowSpan {
  readonly from: number;
  readonly to: number;
  readonly boundary: number;
}

function rowSpan(row: number, shorterLength: number, maxDistance: number): RowSpan {
  return {
    from: Math.max(1, row - maxDistance),
    to: Math.min(shorterLength, row + maxDistance),
    boundary: row <= maxDistance && row - maxDistance <= 1 ? row : UNREACHABLE,
  };
}

function fillRow(
  previous: Int32Array<ArrayBuffer>,
  current: Int32Array<ArrayBuffer>,
  shorter: string,
  code: number,
  span: RowSpan,
): number {
  current[span.from - 1] = span.boundary;
  let diagonal = previous[span.from - 1] as number;
  let left = span.boundary;
  let rowBest = span.boundary;
  for (let column = span.from; column <= span.to; column += 1) {
    const up = previous[column] as number;
    const cost = code === shorter.charCodeAt(column - 1) ? 0 : 1;
    const best = Math.min(diagonal + cost, up + 1, left + 1);
    current[column] = best;
    diagonal = up;
    left = best;
    rowBest = best < rowBest ? best : rowBest;
  }
  return rowBest;
}

function editDistanceWithin(shorter: string, longer: string, maxDistance: number): number {
  const width = shorter.length + 1;
  let previous: Int32Array<ArrayBuffer> = seedRow(width, maxDistance);
  let current: Int32Array<ArrayBuffer> = new Int32Array(width);
  for (let row = 1; row <= longer.length; row += 1) {
    const span = rowSpan(row, shorter.length, maxDistance);
    if (span.to + 1 < width) {
      current[span.to + 1] = UNREACHABLE;
    }
    if (fillRow(previous, current, shorter, longer.charCodeAt(row - 1), span) > maxDistance) {
      return UNREACHABLE;
    }
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[shorter.length] as number;
}

function order(left: string, right: string): readonly [string, string] {
  return left.length <= right.length ? [left, right] : [right, left];
}

export function similarityRatio(left: string, right: string): number {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (a === b) {
    return 1;
  }
  const longest = Math.max(a.length, b.length);
  const [shorter, longer] = order(a, b);
  return (longest - editDistanceWithin(shorter, longer, longest)) / longest;
}

export function similarityAtLeast(
  left: string,
  right: string,
  threshold: number,
): number | undefined {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (a === b) {
    return 1;
  }
  const longest = Math.max(a.length, b.length);
  const budget = Math.min(longest, Math.ceil(longest * (1 - threshold)) + 1);
  const [shorter, longer] = order(a, b);
  const distance = editDistanceWithin(shorter, longer, budget);
  if (distance > budget) {
    return undefined;
  }
  const ratio = (longest - distance) / longest;
  return ratio >= threshold ? ratio : undefined;
}
