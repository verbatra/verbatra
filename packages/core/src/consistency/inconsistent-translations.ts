import { normalizeText } from "../hash/normalize-text.js";
import type { LocaleResource } from "../model/locale-resource.js";
import type { TranslationEntry } from "../model/translation-entry.js";

/** One distinct translated value inside an {@link InconsistencyGroup}, with every key holding it. */
export interface InconsistentTranslation {
  /**
   * The translated value in its compared form: Unicode NFC, line endings folded to `\n`, and
   * leading and trailing whitespace trimmed. Internal whitespace and letter case are kept.
   */
  readonly value: string;
  /** Every key in this locale holding this value, sorted by UTF-16 code unit. */
  readonly keys: readonly string[];
}

/**
 * One source string that is translated more than one way within a single target locale. Keys are
 * grouped only when their source value, description, meaning, plural flag, and context all agree,
 * so a string that deliberately carries different disambiguation metadata is never reported.
 */
export interface InconsistencyGroup {
  /** The shared source value in its compared form (see {@link InconsistentTranslation.value}). */
  readonly source: string;
  /** The disambiguation context every key in the group shares, when the format has one. */
  readonly context?: string;
  /** The description every key in the group shares, when there is one. */
  readonly description?: string;
  /** The meaning every key in the group shares, when there is one. */
  readonly meaning?: string;
  /** Whether the grouped source entries carry plural forms. */
  readonly isPlural: boolean;
  /** Every distinct translation, at least two, sorted by value in UTF-16 code unit order. */
  readonly translations: readonly InconsistentTranslation[];
}

export interface InconsistentTranslationsOptions {
  readonly contextOf?: (key: string) => string | undefined;
}

interface GroupIdentity {
  readonly source: string;
  readonly context: string | undefined;
  readonly description: string | undefined;
  readonly meaning: string | undefined;
  readonly isPlural: boolean;
}

interface GroupAccumulator {
  readonly identity: GroupIdentity;
  readonly translations: Map<string, string[]>;
}

function comparedForm(text: string): string {
  return normalizeText(text).trim();
}

function optionalNormalized(text: string | undefined): string | undefined {
  return text === undefined ? undefined : normalizeText(text);
}

function identityOf(
  key: string,
  sourceEntry: TranslationEntry,
  options: InconsistentTranslationsOptions,
): GroupIdentity {
  return {
    source: comparedForm(sourceEntry.value),
    context: options.contextOf?.(key),
    description: optionalNormalized(sourceEntry.description),
    meaning: optionalNormalized(sourceEntry.meaning),
    isPlural: sourceEntry.isPlural,
  };
}

function groupKeyOf(identity: GroupIdentity): string {
  return JSON.stringify([
    identity.source,
    identity.context ?? null,
    identity.description ?? null,
    identity.meaning ?? null,
    identity.isPlural,
  ]);
}

function compareCodeUnits(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

function compareOptional(left: string | undefined, right: string | undefined): number {
  if (left === undefined || right === undefined) {
    return Number(left !== undefined) - Number(right !== undefined);
  }
  return compareCodeUnits(left, right);
}

function compareIdentities(left: GroupIdentity, right: GroupIdentity): number {
  return (
    compareCodeUnits(left.source, right.source) ||
    compareOptional(left.context, right.context) ||
    compareOptional(left.description, right.description) ||
    compareOptional(left.meaning, right.meaning) ||
    Number(left.isPlural) - Number(right.isPlural)
  );
}

function addToGroup(
  groups: Map<string, GroupAccumulator>,
  identity: GroupIdentity,
  translation: string,
  key: string,
): void {
  const groupKey = groupKeyOf(identity);
  let group = groups.get(groupKey);
  if (group === undefined) {
    group = { identity, translations: new Map() };
    groups.set(groupKey, group);
  }
  const keys = group.translations.get(translation);
  if (keys === undefined) {
    group.translations.set(translation, [key]);
  } else {
    keys.push(key);
  }
}

function toGroup(accumulator: GroupAccumulator): InconsistencyGroup {
  const { identity } = accumulator;
  const translations = [...accumulator.translations]
    .map(([value, keys]) => ({ value, keys: keys.sort(compareCodeUnits) }))
    .sort((left, right) => compareCodeUnits(left.value, right.value));
  return {
    source: identity.source,
    ...(identity.context !== undefined ? { context: identity.context } : {}),
    ...(identity.description !== undefined ? { description: identity.description } : {}),
    ...(identity.meaning !== undefined ? { meaning: identity.meaning } : {}),
    isPlural: identity.isPlural,
    translations,
  };
}

export function findInconsistentTranslations(
  source: LocaleResource,
  target: LocaleResource,
  keys: Iterable<string>,
  options: InconsistentTranslationsOptions = {},
): readonly InconsistencyGroup[] {
  const groups = new Map<string, GroupAccumulator>();
  for (const key of keys) {
    const sourceEntry = source.entries.get(key);
    const targetEntry = target.entries.get(key);
    if (sourceEntry === undefined || targetEntry === undefined) {
      continue;
    }
    const identity = identityOf(key, sourceEntry, options);
    const translation = comparedForm(targetEntry.value);
    if (identity.source === "" || translation === "") {
      continue;
    }
    addToGroup(groups, identity, translation, key);
  }
  return [...groups.values()]
    .filter((group) => group.translations.size > 1)
    .sort((left, right) => compareIdentities(left.identity, right.identity))
    .map(toGroup);
}
