import {
  DEFAULT_LOCALE,
  LOCALES,
  localeAlternation,
  localeSuffixes,
  TRANSLATED_LOCALES,
  translationFilePattern,
} from "../apps/docs/lib/locales.ts";

export { DEFAULT_LOCALE, LOCALES, localeAlternation, TRANSLATED_LOCALES, translationFilePattern };

export const LOCALE_SUFFIXES = localeSuffixes();

export function isTranslationFile(file) {
  return translationFilePattern().test(file);
}

export function localeOfFile(file) {
  return translationFilePattern().exec(file)?.[2] ?? DEFAULT_LOCALE;
}

export function suffixOfFile(file) {
  const locale = translationFilePattern().exec(file)?.[2];
  return locale === undefined ? "" : `.${locale}`;
}

export function withoutLocaleSuffix(file, extension = "mdx") {
  return file.replace(translationFilePattern(TRANSLATED_LOCALES, extension), `$1.${extension}`);
}

export function assertLocaleTable(table, name, keys = LOCALE_SUFFIXES) {
  const missing = keys.filter((key) => !(key in table));
  const extra = Object.keys(table).filter((key) => !keys.includes(key));
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(`${name} locale entries differ: missing [${missing}], extra [${extra}]`);
  }
  return table;
}
