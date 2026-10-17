const SCRIPTS_WITHOUT_WORD_SEPARATORS =
  "\\p{scx=Han}\\p{scx=Hiragana}\\p{scx=Katakana}\\p{scx=Thai}\\p{scx=Lao}\\p{scx=Khmer}\\p{scx=Myanmar}\\p{scx=Tibetan}";
const WORD_JOINING = `[[\\p{L}\\p{M}\\p{N}_]--[${SCRIPTS_WITHOUT_WORD_SEPARATORS}]]`;
const WORD_JOINING_AT_START = new RegExp(`^${WORD_JOINING}`, "v");
const WORD_JOINING_AT_END = new RegExp(`${WORD_JOINING}$`, "v");
const MAX_CODE_UNITS_PER_CODE_POINT = 2;

function isPrecededByWordCharacter(text: string, index: number): boolean {
  const start = Math.max(0, index - MAX_CODE_UNITS_PER_CODE_POINT);
  return WORD_JOINING_AT_END.test(text.slice(start, index));
}

function isFollowedByWordCharacter(text: string, index: number): boolean {
  return WORD_JOINING_AT_START.test(text.slice(index, index + MAX_CODE_UNITS_PER_CODE_POINT));
}

export function wholeTermIndices(text: string, term: string): number[] {
  const indices: number[] = [];
  if (term === "") {
    return indices;
  }
  const guardStart = WORD_JOINING_AT_START.test(term);
  const guardEnd = WORD_JOINING_AT_END.test(term);
  for (let index = text.indexOf(term); index !== -1; index = text.indexOf(term, index + 1)) {
    const blockedStart = guardStart && isPrecededByWordCharacter(text, index);
    const blockedEnd = guardEnd && isFollowedByWordCharacter(text, index + term.length);
    if (!blockedStart && !blockedEnd) {
      indices.push(index);
    }
  }
  return indices;
}

export function occursAsWholeTerm(text: string, term: string): boolean {
  return wholeTermIndices(text, term).length > 0;
}
