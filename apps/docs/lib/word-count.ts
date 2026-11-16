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

export const SPACELESS_SCRIPT =
  /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u30FB\u30FC]/u;

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

function joinLoneRuns(segments: Iterable<WordSegment>, japanese: boolean): Run[] {
  const runs: Run[] = [];
  let index = 0;
  for (const segment of segments) {
    const lone = isLoneCharacter(segment);
    const previous = runs.at(-1);
    if (
      previous?.lone === true &&
      lone &&
      (!japanese || sameScript(previous.group.text, segment.segment))
    )
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

function sameScript(previous: string, next: string): boolean {
  return HAN_CHARACTER.test(previous.slice(-1)) === HAN_CHARACTER.test(next);
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

function placeRun(
  groups: WordGroup[],
  run: WordGroup,
  lone: boolean,
  forward: boolean,
): WordGroup | null {
  const previous = groups.at(-1);
  if (lone && forward) return run;
  if (lone && previous?.isWordLike === true) {
    attachRun(groups, previous, run);
    return null;
  }
  if (lone && characterCount(run.text) < MIN_GROUP_CHARACTERS) return run;
  groups.push(run);
  return null;
}

function absorbSingleCharacters(runs: Run[], japanese: boolean): WordGroup[] {
  const groups: WordGroup[] = [];
  let carried: WordGroup | null = null;
  for (const [position, { group, lone }] of runs.entries()) {
    if (carried !== null && group.isWordLike) {
      groups.push(mergeGroups(carried, group));
      carried = null;
      continue;
    }
    if (carried !== null) groups.push(carried);
    const next = runs[position + 1]?.group;
    carried = placeRun(
      groups,
      group,
      lone,
      japanese && next?.isWordLike === true && leadsInto(group.text, next.text),
    );
  }
  if (carried !== null) groups.push(carried);
  return groups;
}

const HAN_CHARACTER = /^\p{Script=Han}$/u;
const HAN_START = /^\p{Script=Han}/u;
const HIRAGANA_START = /^\p{Script=Hiragana}/u;
const PARTICLE_START = /^[はがをにでとのもへやかねよ]/u;
const KATAKANA = /\p{Script=Katakana}/u;
const KATAKANA_OR_MARK = /[\p{Script=Katakana}\u30FC]/u;
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const MAX_KATAKANA_FRAGMENT = 3;
const MAX_FRAGMENT_PAIR = 2;
const MAX_WORD_CHARACTERS = 8;

function leadsInto(character: string, next: string): boolean {
  if (!HAN_CHARACTER.test(character)) return false;
  const starts = HAN_START.test(next) || (HIRAGANA_START.test(next) && !PARTICLE_START.test(next));
  return starts && characterCount(next) < MAX_WORD_CHARACTERS;
}

function bothShortKatakana(previous: string, next: string): boolean {
  return (
    Math.max(characterCount(previous), characterCount(next)) <= MAX_FRAGMENT_PAIR &&
    continuesKatakana(previous, next)
  );
}

function continuesKatakana(previous: string, next: string): boolean {
  const last = previous.slice(-1);
  const first = next.slice(0, 1);
  return (
    KATAKANA_OR_MARK.test(last) &&
    KATAKANA_OR_MARK.test(first) &&
    (KATAKANA.test(last) || KATAKANA.test(first)) &&
    Math.min(characterCount(previous), characterCount(next)) <= MAX_KATAKANA_FRAGMENT
  );
}

function mergeWhile(
  groups: WordGroup[],
  joins: (previous: string, next: string) => boolean,
): WordGroup[] {
  const merged: WordGroup[] = [];
  for (const group of groups) {
    const previous = merged.at(-1);
    if (
      previous?.isWordLike === true &&
      group.isWordLike &&
      characterCount(previous.text) + characterCount(group.text) <= MAX_WORD_CHARACTERS &&
      joins(previous.text, group.text)
    )
      merged[merged.length - 1] = mergeGroups(previous, group);
    else merged.push(group);
  }
  return merged;
}

function toGroups(segments: readonly WordSegment[]): WordGroup[] {
  let index = 0;
  return segments.map((segment) => {
    const group = { text: segment.segment, index, isWordLike: segment.isWordLike === true };
    index += segment.segment.length;
    return group;
  });
}

export function groupWordSegments(
  segments: Iterable<WordSegment>,
  { keepEndings = true }: { readonly keepEndings?: boolean } = {},
): WordGroup[] {
  const list = [...segments];
  const japanese = list.some((segment) => KANA.test(segment.segment));
  const words = mergeWhile(mergeWhile(toGroups(list), bothShortKatakana), continuesKatakana);
  const runs = joinLoneRuns(
    words.map((word) => ({ segment: word.text, isWordLike: word.isWordLike })),
    japanese,
  );
  const groups = absorbSingleCharacters(runs, japanese);
  return keepEndings ? mergeWhile(groups, (_previous, next) => HIRAGANA_START.test(next)) : groups;
}

export function lastWordStart(text: string, locale: string): number {
  let start = 0;
  for (const group of groupWordSegments(wordSegmenter(locale).segment(text), {
    keepEndings: false,
  }))
    if (group.isWordLike) start = group.index;
  return start;
}
