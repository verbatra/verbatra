export interface LiteralMatch {
  readonly start: number;
  readonly end: number;
}

interface FoldedText {
  readonly folded: string;
  readonly origin: readonly number[];
}

function foldPerCodePoint(text: string): FoldedText {
  let folded = "";
  const origin: number[] = [];
  let index = 0;
  for (const character of text) {
    const lowered = character.toLowerCase();
    folded += lowered;
    for (let unit = 0; unit < lowered.length; unit++) {
      origin.push(index);
    }
    index += character.length;
  }
  return { folded, origin };
}

function startsCharacter(origin: readonly number[], at: number): boolean {
  return at === 0 || origin[at] !== origin[at - 1];
}

function foldedMatches(value: string, find: string): readonly LiteralMatch[] {
  const text = foldPerCodePoint(value);
  const needle = foldPerCodePoint(find).folded;
  const matches: LiteralMatch[] = [];
  let from = 0;
  while (from <= text.folded.length - needle.length) {
    const at = text.folded.indexOf(needle, from);
    if (at === -1) {
      break;
    }
    const to = at + needle.length;
    if (
      startsCharacter(text.origin, at) &&
      (to === text.folded.length || startsCharacter(text.origin, to))
    ) {
      matches.push({
        start: text.origin[at] as number,
        end: to === text.folded.length ? value.length : (text.origin[to] as number),
      });
      from = to;
    } else {
      from = at + 1;
    }
  }
  return matches;
}

function exactMatches(value: string, find: string): readonly LiteralMatch[] {
  const matches: LiteralMatch[] = [];
  let from = 0;
  while (from <= value.length - find.length) {
    const at = value.indexOf(find, from);
    if (at === -1) {
      break;
    }
    matches.push({ start: at, end: at + find.length });
    from = at + find.length;
  }
  return matches;
}

export function findLiteralMatches(
  value: string,
  find: string,
  caseSensitive: boolean,
): readonly LiteralMatch[] {
  return caseSensitive ? exactMatches(value, find) : foldedMatches(value, find);
}

export function replacedLength(
  value: string,
  matches: readonly LiteralMatch[],
  replacement: string,
): number {
  let length = value.length;
  for (const match of matches) {
    length += replacement.length - (match.end - match.start);
  }
  return length;
}

export function replaceMatches(
  value: string,
  matches: readonly LiteralMatch[],
  replacement: string,
): string {
  const parts: string[] = [];
  let cursor = 0;
  for (const match of matches) {
    parts.push(value.slice(cursor, match.start), replacement);
    cursor = match.end;
  }
  parts.push(value.slice(cursor));
  return parts.join("");
}
