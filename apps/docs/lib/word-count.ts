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
      (!japanese || bothHanOrBothKana(previous.group.text, segment.segment))
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

function bothHanOrBothKana(previous: string, next: string): boolean {
  return HAN_CHARACTER.test(previous.slice(-1)) === HAN_CHARACTER.test(next);
}

function mergeGroups(first: WordGroup, second: WordGroup): WordGroup {
  return { text: first.text + second.text, index: first.index, isWordLike: true };
}

function attachRun(
  groups: WordGroup[],
  previous: WordGroup,
  run: WordGroup,
  japanese: boolean,
): boolean {
  const characters = [...run.text];
  const attached = characters.length <= MAX_WHOLE_RUN_ATTACHED ? characters.length : 1;
  const head = characters.slice(0, attached).join("");
  const overflows = !fitsWord(previous.text, head) && !continuesKatakana(previous.text, head);
  if (japanese && overflows) return false;
  groups[groups.length - 1] = mergeGroups(previous, { ...run, text: head });
  if (attached < characters.length)
    groups.push({
      text: characters.slice(attached).join(""),
      index: run.index + head.length,
      isWordLike: true,
    });
  return true;
}

function placeRun(
  groups: WordGroup[],
  run: WordGroup,
  lone: boolean,
  forward: boolean,
  japanese: boolean,
): WordGroup | null {
  const previous = groups.at(-1);
  if (lone && forward) return run;
  if (lone && previous?.isWordLike === true && attachRun(groups, previous, run, japanese))
    return null;
  if (lone && characterCount(run.text) < MIN_GROUP_CHARACTERS) return run;
  groups.push(run);
  return null;
}

function absorbSingleCharacters(runs: Run[], japanese: boolean): WordGroup[] {
  const groups: WordGroup[] = [];
  let carried: WordGroup | null = null;
  for (const [position, { group, lone }] of runs.entries()) {
    const joinsCarried =
      !japanese ||
      (!(lone && PREFIX_KANJI.test(group.text)) && fitsWord(carried?.text ?? "", group.text));
    if (carried !== null && group.isWordLike && joinsCarried) {
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
      japanese &&
        next?.isWordLike === true &&
        leadsInto(group.text, next.text, groups.at(-1)?.text ?? ""),
      japanese,
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
export const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const PREFIX_KANJI = /^[各他要新旧非未全]$/u;
const SUFFIX_HOST =
  /(?:[\p{Script=Han}\p{Script=Katakana}\u30FC]|\p{Script=Han}[きぎしじちびみりめけげせてねべれえ])$/u;
const LEADING_PARTICLE = /^[はがをにでとのもへやかねよ](?=.)/u;
const KATAKANA_BEFORE_HIRAGANA = /^[\p{Script=Katakana}\u30FC]+(?=\p{Script=Hiragana})/u;
const FRAGMENT_START = /^(?:ま[すせし]|せ|し[たて]|さい|たい|れ[るたて]|られ|ない|てい|いま|でし)/u;
const MAX_KATAKANA_FRAGMENT = 3;
const MAX_FRAGMENT_PAIR = 2;
const MAX_WORD_CHARACTERS = 8;

function fitsWord(first: string, second: string): boolean {
  return characterCount(first) + characterCount(second) <= MAX_WORD_CHARACTERS;
}

function leadsInto(character: string, next: string, previous: string): boolean {
  if (!HAN_CHARACTER.test(character)) return false;
  if (PREFIX_KANJI.test(character)) return !HIRAGANA_START.test(next);
  if (SUFFIX_HOST.test(previous)) return false;
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
  finishesWord = false,
): WordGroup[] {
  const merged: WordGroup[] = [];
  let pieces = 1;
  for (const group of groups) {
    const previous = merged.at(-1);
    const finishing =
      finishesWord &&
      pieces > 1 &&
      previous !== undefined &&
      /ー$/u.test(previous.text) &&
      characterCount(previous.text) <= MAX_WORD_CHARACTERS &&
      characterCount(group.text) <= MAX_KATAKANA_FRAGMENT;
    if (
      previous?.isWordLike === true &&
      group.isWordLike &&
      (finishing || fitsWord(previous.text, group.text)) &&
      joins(previous.text, group.text)
    ) {
      merged[merged.length - 1] = mergeGroups(previous, group);
      pieces += 1;
    } else {
      merged.push(group);
      pieces = 1;
    }
  }
  return merged;
}

function stemCut(previous: string, fragment: string): number {
  const particle =
    LEADING_PARTICLE.test(previous) && !FRAGMENT_START.test(previous.slice(1)) ? 1 : 0;
  const run = KATAKANA_BEFORE_HIRAGANA.exec(previous.slice(particle))?.[0].length ?? 0;
  const rest = previous.slice(particle + run);
  const cleanTail = run > 0 && !FRAGMENT_START.test(rest + fragment) && fitsWord(rest, fragment);
  return cleanTail ? particle + run : particle;
}

function splitBeforeStem(previous: WordGroup, fragment: WordGroup): WordGroup[] {
  const cut = stemCut(previous.text, fragment.text);
  const stem = {
    text: previous.text.slice(cut),
    index: previous.index + cut,
    isWordLike: true,
  };
  const joined = mergeGroups(stem, fragment);
  return cut === 0 ? [joined] : [{ ...previous, text: previous.text.slice(0, cut) }, joined];
}

function placeFragment(units: WordGroup[][], open: WordGroup[], fragment: WordGroup): void {
  let cut = open.length - 1;
  while (cut > 0 && FRAGMENT_START.test(open[cut]?.text ?? "")) cut -= 1;
  if (cut > 0) units.splice(-1, 1, open.slice(0, cut), [...open.slice(cut), fragment]);
  else
    units.splice(
      -1,
      1,
      ...splitBeforeStem(open.reduce(mergeGroups), fragment).map((group) => [group]),
    );
}

function mergeEndings(groups: WordGroup[]): WordGroup[] {
  const units: WordGroup[][] = [];
  for (const group of groups) {
    const open = units.at(-1);
    const continues =
      open?.at(-1)?.isWordLike === true && group.isWordLike && HIRAGANA_START.test(group.text);
    if (!continues || open === undefined) units.push([group]);
    else if (fitsWord(open.map((unit) => unit.text).join(""), group.text)) open.push(group);
    else if (FRAGMENT_START.test(group.text)) placeFragment(units, open, group);
    else units.push([group]);
  }
  return units.map((unit) => unit.reduce(mergeGroups));
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
  const words = mergeWhile(mergeWhile(toGroups(list), bothShortKatakana), continuesKatakana, true);
  const runs = joinLoneRuns(
    words.map((word) => ({ segment: word.text, isWordLike: word.isWordLike })),
    japanese,
  );
  const groups = absorbSingleCharacters(runs, japanese);
  return keepEndings ? mergeEndings(groups) : groups;
}
