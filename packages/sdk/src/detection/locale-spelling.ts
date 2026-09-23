import { localeCodeSchema } from "../config/locale-code.js";

export type SpellingKind = "plain" | "hyphen" | "underscore" | "android" | "android-source";

export interface SpelledLocale {
  readonly locale: string | undefined;
  readonly kind: SpellingKind;
}

const LANGUAGE = /^[a-z]{2,3}$/;
const SCRIPT = /^[A-Za-z][a-z]{3}$/;
const REGION = /^(?:[A-Z]{2}|[a-z]{2}|[0-9]{3})$/;
const ANDROID_SOURCE = "values";
const ANDROID_PREFIX = "values-";
const ANDROID_LEGACY = /^([a-z]{2,3})(?:-r([A-Z]{2}))?$/;
const ANDROID_BCP47_PREFIX = "b+";

let languageNames: Intl.DisplayNames | undefined;

function isKnownLanguage(language: string): boolean {
  languageNames ??= new Intl.DisplayNames(["en"], { type: "language", fallback: "none" });
  try {
    return languageNames.of(language) !== undefined;
  } catch {
    return false;
  }
}

function isValidLocale(locale: string): boolean {
  return localeCodeSchema.safeParse(locale).success;
}

function tagFromSubtags(subtags: readonly string[]): string | undefined {
  const [language, ...rest] = subtags;
  if (language === undefined || !LANGUAGE.test(language) || !isKnownLanguage(language)) {
    return undefined;
  }
  let index = 0;
  for (const pattern of [SCRIPT, REGION]) {
    const subtag = rest[index];
    if (subtag !== undefined && pattern.test(subtag)) {
      index += 1;
    }
  }
  if (index !== rest.length) {
    return undefined;
  }
  const locale = [language, ...rest].join("-");
  return isValidLocale(locale) ? locale : undefined;
}

function parseTagSpelling(spelling: string): SpelledLocale | undefined {
  const hasUnderscore = spelling.includes("_");
  if (hasUnderscore && spelling.includes("-")) {
    return undefined;
  }
  const subtags = spelling.split(hasUnderscore ? "_" : "-");
  const locale = tagFromSubtags(subtags);
  if (locale === undefined) {
    return undefined;
  }
  if (subtags.length === 1) {
    return { locale, kind: "plain" };
  }
  return { locale, kind: hasUnderscore ? "underscore" : "hyphen" };
}

function parseAndroidQualifier(qualifier: string): string | undefined {
  if (qualifier.startsWith(ANDROID_BCP47_PREFIX)) {
    return tagFromSubtags(qualifier.slice(ANDROID_BCP47_PREFIX.length).split("+"));
  }
  const legacy = ANDROID_LEGACY.exec(qualifier);
  if (legacy === null) {
    return undefined;
  }
  const [, language = "", region] = legacy;
  return tagFromSubtags(region === undefined ? [language] : [language, region]);
}

function parseAndroidSpelling(spelling: string): SpelledLocale | undefined {
  if (spelling === ANDROID_SOURCE) {
    return { locale: undefined, kind: "android-source" };
  }
  if (!spelling.startsWith(ANDROID_PREFIX)) {
    return undefined;
  }
  const locale = parseAndroidQualifier(spelling.slice(ANDROID_PREFIX.length));
  return locale === undefined ? undefined : { locale, kind: "android" };
}

export function parseLocaleSpelling(spelling: string): SpelledLocale | undefined {
  return parseAndroidSpelling(spelling) ?? parseTagSpelling(spelling);
}
