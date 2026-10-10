import type { FormatId } from "@verbatra/core";
import type { SourceFramework } from "@verbatra/extract";
import { pluralLookupKey } from "./plural-categories.js";

const SUFFIX_PLURAL_FRAMEWORKS: ReadonlySet<SourceFramework> = new Set(["i18next"]);

const PLURAL_FORM_MARKING_FORMATS: ReadonlySet<FormatId> = new Set([
  "i18next-json",
  "android-xml",
  "gettext-po",
  "apple-strings",
  "apple-xcstrings",
]);

export interface PluralSuffixRules {
  readonly framework: SourceFramework;
  readonly format: FormatId;
}

export function foldsPluralSuffix(rules: PluralSuffixRules, isPlural: boolean): boolean {
  return (
    SUFFIX_PLURAL_FRAMEWORKS.has(rules.framework) &&
    (isPlural || !PLURAL_FORM_MARKING_FORMATS.has(rules.format))
  );
}

export function pluralSuffixLookup(
  rules: PluralSuffixRules,
  key: string,
  isPlural: boolean,
): string | undefined {
  return foldsPluralSuffix(rules, isPlural) ? pluralLookupKey(key) : undefined;
}
