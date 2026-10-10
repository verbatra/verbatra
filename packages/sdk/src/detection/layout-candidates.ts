import { extname } from "node:path";
import { LOCALE_TOKEN } from "../locale-path/pattern.js";
import type { LocaleStyle } from "../locale-path/style.js";
import { parseLocaleSpelling, type SpelledLocale } from "./locale-spelling.js";

export interface LayoutGroup {
  readonly pattern: string;
  readonly depth: number;
  readonly wholeSegment: boolean;
  readonly sharedCatalogue: boolean;
  readonly members: ReadonlyMap<string, SpelledLocale>;
}

export interface ConsistentLayout {
  readonly group: LayoutGroup;
  readonly localeStyle: LocaleStyle;
}

export type LayoutChoice =
  | { readonly kind: "found"; readonly layout: ConsistentLayout }
  | { readonly kind: "ambiguous"; readonly candidates: readonly string[] }
  | { readonly kind: "none" };

export type IsSharedCatalogueFile = (path: string) => boolean;

interface SegmentSplit {
  readonly prefix: string;
  readonly spelling: string;
  readonly suffix: string;
}

interface MutableGroup {
  readonly pattern: string;
  readonly depth: number;
  readonly wholeSegment: boolean;
  readonly sharedCatalogue: boolean;
  readonly members: Map<string, SpelledLocale>;
}

const STEM_SEPARATORS = new Set([".", "_", "-"]);
const LPROJ_SUFFIX = ".lproj";

function fileSplits(segment: string): readonly SegmentSplit[] {
  const suffix = extname(segment);
  const stem = segment.slice(0, segment.length - suffix.length);
  const splits: SegmentSplit[] = [{ prefix: "", spelling: stem, suffix }];
  for (let index = 1; index < stem.length - 1; index += 1) {
    if (STEM_SEPARATORS.has(stem.charAt(index))) {
      splits.push({
        prefix: stem.slice(0, index + 1),
        spelling: stem.slice(index + 1),
        suffix,
      });
    }
  }
  return splits;
}

function directorySplits(segment: string): readonly SegmentSplit[] {
  const splits: SegmentSplit[] = [{ prefix: "", spelling: segment, suffix: "" }];
  if (segment.endsWith(LPROJ_SUFFIX) && segment.length > LPROJ_SUFFIX.length) {
    splits.push({
      prefix: "",
      spelling: segment.slice(0, -LPROJ_SUFFIX.length),
      suffix: LPROJ_SUFFIX,
    });
  }
  return splits;
}

function addMember(
  groups: Map<string, MutableGroup>,
  shape: Omit<MutableGroup, "members">,
  file: string,
  spelled: SpelledLocale,
): void {
  const existing = groups.get(shape.pattern);
  const group = existing ?? { ...shape, members: new Map<string, SpelledLocale>() };
  group.members.set(file, spelled);
  if (existing === undefined) {
    groups.set(shape.pattern, group);
  }
}

function addFileCandidates(groups: Map<string, MutableGroup>, file: string): void {
  const segments = file.split("/");
  segments.forEach((segment, depth) => {
    const isFile = depth === segments.length - 1;
    const splits = isFile ? fileSplits(segment) : directorySplits(segment);
    const [whole] = splits;
    const wholeIsLocale = whole !== undefined && parseLocaleSpelling(whole.spelling) !== undefined;
    for (const split of wholeIsLocale ? [whole] : splits) {
      const spelled = parseLocaleSpelling(split.spelling);
      if (spelled === undefined) {
        continue;
      }
      const tokenSegment = `${split.prefix}${LOCALE_TOKEN}${split.suffix}`;
      const pattern = [...segments.slice(0, depth), tokenSegment, ...segments.slice(depth + 1)];
      addMember(
        groups,
        {
          pattern: pattern.join("/"),
          depth,
          wholeSegment: split.prefix === "" && split.suffix === "",
          sharedCatalogue: false,
        },
        file,
        spelled,
      );
    }
  });
}

function sharedCataloguePattern(file: string): string {
  const slash = file.lastIndexOf("/");
  return `${file.slice(0, slash + 1)}${LOCALE_TOKEN}${file.slice(slash + 1)}`;
}

function addSharedCatalogue(groups: Map<string, MutableGroup>, file: string): void {
  addMember(
    groups,
    {
      pattern: sharedCataloguePattern(file),
      depth: file.split("/").length - 1,
      wholeSegment: false,
      sharedCatalogue: true,
    },
    file,
    { locale: undefined, kind: "plain" },
  );
}

export function buildLayoutGroups(
  files: readonly string[],
  isSharedCatalogueFile: IsSharedCatalogueFile,
): readonly LayoutGroup[] {
  const groups = new Map<string, MutableGroup>();
  for (const file of files) {
    if (isSharedCatalogueFile(file)) {
      addSharedCatalogue(groups, file);
    } else {
      addFileCandidates(groups, file);
    }
  }
  return [...groups.values()];
}

function isAndroidKind(spelled: SpelledLocale): boolean {
  return spelled.kind === "android" || spelled.kind === "android-source";
}

export function localeStyleOf(group: LayoutGroup): LocaleStyle | undefined {
  const spellings = [...group.members.values()];
  const android = spellings.filter(isAndroidKind).length;
  if (android > 0) {
    return android === spellings.length && group.wholeSegment ? "android" : undefined;
  }
  const hyphen = spellings.some((spelled) => spelled.kind === "hyphen");
  const underscore = spellings.some((spelled) => spelled.kind === "underscore");
  if (hyphen && underscore) {
    return undefined;
  }
  return underscore ? "posix" : "literal";
}

const LOCALE_PATH_HINTS = [
  "locale",
  "i18n",
  "l10n",
  "lang",
  "translation",
  "messages",
  "intl",
  "strings",
  "lproj",
  "res/",
];

const TRANSLATION_ONLY_EXTENSIONS: ReadonlySet<string> = new Set([
  ".po",
  ".pot",
  ".xlf",
  ".xliff",
  ".arb",
  ".strings",
  ".resx",
]);

function mentionsLocale(text: string): boolean {
  const lower = text.toLowerCase();
  return LOCALE_PATH_HINTS.some((hint) => lower.includes(hint));
}

function hasLocaleHint(group: LayoutGroup): boolean {
  const pattern = group.pattern.replaceAll(LOCALE_TOKEN, "");
  return mentionsLocale(pattern) || TRANSLATION_ONLY_EXTENSIONS.has(extname(pattern).toLowerCase());
}

function hasHintBeforeToken(group: LayoutGroup): boolean {
  return mentionsLocale(group.pattern.slice(0, group.pattern.indexOf(LOCALE_TOKEN)));
}

function isThreeLetterLanguage(spelled: SpelledLocale): boolean {
  return spelled.locale !== undefined && /^[a-z]{3}(?:-|$)/i.test(spelled.locale);
}

function isPlausible(group: LayoutGroup): boolean {
  if (group.sharedCatalogue) {
    return true;
  }
  const spellings = [...group.members.values()];
  if (spellings.every(isThreeLetterLanguage)) {
    return hasHintBeforeToken(group);
  }
  return spellings.length > 1 || hasLocaleHint(group);
}

const BASE_NAME_SEPARATORS = new Set([".", "_", "-"]);

function strippedTokenPath(pattern: string): string | undefined {
  const index = pattern.indexOf(LOCALE_TOKEN);
  const before = pattern.slice(0, index);
  const separator = before.charAt(before.length - 1);
  const beforeSeparator = before.charAt(before.length - 2);
  if (!BASE_NAME_SEPARATORS.has(separator) || beforeSeparator === "" || beforeSeparator === "/") {
    return undefined;
  }
  return `${before.slice(0, -1)}${pattern.slice(index + LOCALE_TOKEN.length)}`;
}

function gettextTemplate(pattern: string, files: readonly string[]): string | undefined {
  if (!pattern.endsWith(".po")) {
    return undefined;
  }
  const stem = pattern.slice(pattern.lastIndexOf("/") + 1, -".po".length);
  if (stem.includes(LOCALE_TOKEN)) {
    return undefined;
  }
  const template = `${stem}.pot`;
  return files.find((file) => file === template || file.endsWith(`/${template}`));
}

export function unqualifiedSourceFile(
  group: LayoutGroup,
  files: readonly string[],
): string | undefined {
  if (group.sharedCatalogue || !group.pattern.includes(LOCALE_TOKEN)) {
    return undefined;
  }
  const stripped = strippedTokenPath(group.pattern);
  if (stripped !== undefined && files.includes(stripped)) {
    return stripped;
  }
  return gettextTemplate(group.pattern, files);
}

function score(group: LayoutGroup): number {
  return group.sharedCatalogue ? 1 : group.members.size;
}

function outranks(a: LayoutGroup, b: LayoutGroup): number {
  return score(b) - score(a) || b.depth - a.depth;
}

function fileSetKey(group: LayoutGroup): string {
  return [...group.members.keys()].sort().join("\n");
}

export function chooseLayout(groups: readonly LayoutGroup[]): LayoutChoice {
  const consistent: ConsistentLayout[] = [];
  for (const group of groups) {
    const localeStyle = localeStyleOf(group);
    if (localeStyle !== undefined && isPlausible(group)) {
      consistent.push({ group, localeStyle });
    }
  }
  consistent.sort((a, b) => outranks(a.group, b.group));
  const [best] = consistent;
  if (best === undefined) {
    return { kind: "none" };
  }
  const tied = consistent.filter((candidate) => score(candidate.group) === score(best.group));
  const competing = tied.filter(
    (candidate, index) =>
      tied.findIndex((other) => fileSetKey(other.group) === fileSetKey(candidate.group)) === index,
  );
  if (competing.length > 1) {
    return {
      kind: "ambiguous",
      candidates: competing.map((candidate) => candidate.group.pattern).sort(),
    };
  }
  const sameFiles = tied.filter((candidate) => outranks(candidate.group, best.group) === 0);
  if (sameFiles.length > 1) {
    return { kind: "ambiguous", candidates: sameFiles.map((candidate) => candidate.group.pattern) };
  }
  return { kind: "found", layout: best };
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function patternMatcher(pattern: string): RegExp {
  const [first = "", ...rest] = pattern.split(LOCALE_TOKEN);
  const tail = rest.map(escapeRegExp).join("\\1");
  return new RegExp(`^${escapeRegExp(first)}([^/]*)${tail}$`);
}

export function normalizePattern(pattern: string): string {
  return pattern.replaceAll("\\", "/").replace(/^(?:\.\/)+/, "");
}

export function groupForPattern(
  pattern: string,
  files: readonly string[],
  isSharedCatalogueFile: IsSharedCatalogueFile,
): LayoutGroup {
  const normalized = normalizePattern(pattern);
  const matcher = patternMatcher(normalized);
  const members = new Map<string, SpelledLocale>();
  let sharedCatalogue = false;
  for (const file of files) {
    const spelling = matcher.exec(file)?.[1];
    if (spelling === undefined) {
      continue;
    }
    if (spelling === "" && isSharedCatalogueFile(file)) {
      sharedCatalogue = true;
      members.set(file, { locale: undefined, kind: "plain" });
      continue;
    }
    const spelled = parseLocaleSpelling(spelling);
    if (spelled !== undefined) {
      members.set(file, spelled);
    }
  }
  const segments = normalized.split("/");
  const depth = segments.findIndex((segment) => segment.includes(LOCALE_TOKEN));
  return {
    pattern: normalized,
    depth,
    wholeSegment: segments.includes(LOCALE_TOKEN),
    sharedCatalogue,
    members,
  };
}
