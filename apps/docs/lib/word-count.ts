const SPACELESS_LANGUAGES: ReadonlySet<string> = new Set(["zh", "ja", "th", "lo", "km", "my"]);

export function isSpaceless(locale: string): boolean {
  return SPACELESS_LANGUAGES.has(new Intl.Locale(locale).language);
}

const segmenters = new Map<string, Intl.Segmenter>();

function wordSegmenter(locale: string): Intl.Segmenter {
  const known = segmenters.get(locale);
  if (known) return known;
  const created = new Intl.Segmenter(locale, { granularity: "word" });
  segmenters.set(locale, created);
  return created;
}

export function countWords(text: string, locale: string): number {
  if (!isSpaceless(locale)) return text.split(/\s+/).filter((word) => word !== "").length;
  let count = 0;
  for (const segment of wordSegmenter(locale).segment(text)) if (segment.isWordLike) count += 1;
  return count;
}

export const SPACELESS_SCRIPT = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

const MIN_GROUP_CHARACTERS = 2;
const MAX_WHOLE_RUN_ATTACHED = 3;

export interface WordSegment {
  readonly segment: string;
  readonly isWordLike?: boolean | undefined;
}

export interface WordGroup {
  readonly text: string;
  readonly index: number;
  readonly isWordLike: boolean;
}

function characterCount(text: string): number {
  return [...text].length;
}

function isLoneCharacter(segment: WordSegment): boolean {
  return (
    segment.isWordLike === true &&
    characterCount(segment.segment) === 1 &&
    SPACELESS_SCRIPT.test(segment.segment)
  );
}

interface Run {
  readonly group: WordGroup;
  readonly lone: boolean;
}

function joinLoneRuns(segments: Iterable<WordSegment>): Run[] {
  const runs: Run[] = [];
  let index = 0;
  for (const segment of segments) {
    const lone = isLoneCharacter(segment);
    const previous = runs.at(-1);
    if (previous?.lone === true && lone)
      runs[runs.length - 1] = {
        lone,
        group: { ...previous.group, text: previous.group.text + segment.segment },
      };
    else
      runs.push({
        lone,
        group: { text: segment.segment, index, isWordLike: segment.isWordLike === true },
      });
    index += segment.segment.length;
  }
  return runs;
}

function mergeGroups(first: WordGroup, second: WordGroup): WordGroup {
  return { text: first.text + second.text, index: first.index, isWordLike: true };
}

function attachRun(groups: WordGroup[], previous: WordGroup, run: WordGroup): void {
  const characters = [...run.text];
  const attached = characters.length <= MAX_WHOLE_RUN_ATTACHED ? characters.length : 1;
  const head = characters.slice(0, attached).join("");
  groups[groups.length - 1] = mergeGroups(previous, { ...run, text: head });
  if (attached < characters.length)
    groups.push({
      text: characters.slice(attached).join(""),
      index: run.index + head.length,
      isWordLike: true,
    });
}

function placeRun(groups: WordGroup[], run: WordGroup, lone: boolean): WordGroup | null {
  const previous = groups.at(-1);
  if (lone && previous?.isWordLike === true) {
    attachRun(groups, previous, run);
    return null;
  }
  if (lone && characterCount(run.text) < MIN_GROUP_CHARACTERS) return run;
  groups.push(run);
  return null;
}

function absorbSingleCharacters(runs: Run[]): WordGroup[] {
  const groups: WordGroup[] = [];
  let carried: WordGroup | null = null;
  for (const { group, lone } of runs) {
    if (carried !== null && group.isWordLike) {
      groups.push(mergeGroups(carried, group));
      carried = null;
      continue;
    }
    if (carried !== null) groups.push(carried);
    carried = placeRun(groups, group, lone);
  }
  if (carried !== null) groups.push(carried);
  return groups;
}

export function groupWordSegments(segments: Iterable<WordSegment>): WordGroup[] {
  return absorbSingleCharacters(joinLoneRuns(segments));
}

export function lastWordStart(text: string, locale: string): number {
  let start = 0;
  for (const group of groupWordSegments(wordSegmenter(locale).segment(text)))
    if (group.isWordLike) start = group.index;
  return start;
}
