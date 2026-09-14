import { normalizeText } from "../hash/normalize-text.js";

function editDistance(shorter: string, longer: string): number {
  let previous = Array.from({ length: shorter.length + 1 }, (_, index) => index);
  let current = new Array<number>(shorter.length + 1);
  for (let row = 1; row <= longer.length; row += 1) {
    current[0] = row;
    for (let column = 1; column <= shorter.length; column += 1) {
      const substitution =
        (previous[column - 1] as number) + (longer[row - 1] === shorter[column - 1] ? 0 : 1);
      const deletion = (previous[column] as number) + 1;
      const insertion = (current[column - 1] as number) + 1;
      current[column] = Math.min(substitution, deletion, insertion);
    }
    const swap = previous;
    previous = current;
    current = swap;
  }
  return previous[shorter.length] as number;
}

export function similarityRatio(left: string, right: string): number {
  const a = normalizeText(left);
  const b = normalizeText(right);
  if (a === b) {
    return 1;
  }
  const longest = Math.max(a.length, b.length);
  const [shorter, longer] = a.length <= b.length ? [a, b] : [b, a];
  return (longest - editDistance(shorter, longer)) / longest;
}
