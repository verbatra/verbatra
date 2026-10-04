import { splitGettextModifier } from "@verbatra/core";
import { z } from "zod";
import { type DoctorFinding, passing, warning } from "../flow/doctor-finding.js";

export const LOCALE_CODE_PATTERN =
  /^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|[0-9]{3}))?(?:-(?:[A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*(?:-[0-9A-WYZa-wyz](?:-[A-Za-z0-9]{2,8})+)*(?:-[Xx](?:-[A-Za-z0-9]{1,8})+)?$/;

function canonicalLocaleCode(code: string): string | undefined {
  try {
    return Intl.getCanonicalLocales(code)[0];
  } catch {
    return undefined;
  }
}

function isValidLocaleCode(code: string): boolean {
  return LOCALE_CODE_PATTERN.test(code) && canonicalLocaleCode(code) !== undefined;
}

function modifierHint(code: string): string | undefined {
  const modified = splitGettextModifier(code);
  if (modified?.script === undefined) {
    return undefined;
  }
  const [language = "", ...region] = modified.base.split("_");
  const hyphenated = [language, modified.script, ...region].join("-");
  if (!isValidLocaleCode(hyphenated)) {
    return "";
  }
  return `; write "${hyphenated}" and set files.localeStyle to "posix" to keep "${code}" in the file names of a gettext-po layout`;
}

function underscoreHint(code: string): string {
  const modifier = modifierHint(code);
  if (modifier !== undefined) {
    return modifier;
  }
  const hyphenated = code.replaceAll("_", "-");
  if (hyphenated === code || !isValidLocaleCode(hyphenated)) {
    return "";
  }
  return `; write "${hyphenated}" and set files.localeStyle to "posix" to keep underscores in file names`;
}

function invalidMessage(code: string): string {
  return `"${code}" is not a valid BCP 47 locale code${underscoreHint(code)}`;
}

export const localeCodeSchema = z
  .string()
  .min(1, { message: "a locale code must not be empty", abort: true })
  .regex(LOCALE_CODE_PATTERN, {
    error: (issue) => invalidMessage(String(issue.input)),
    abort: true,
  })
  .refine((code) => canonicalLocaleCode(code) !== undefined, {
    error: (issue) => invalidMessage(String(issue.input)),
  });

interface NonCanonicalLocale {
  readonly locale: string;
  readonly canonical: string;
}

function nonCanonicalLocales(locales: readonly string[]): readonly NonCanonicalLocale[] {
  const found: NonCanonicalLocale[] = [];
  for (const locale of locales) {
    const canonical = canonicalLocaleCode(locale);
    if (canonical !== undefined && canonical !== locale) {
      found.push({ locale, canonical });
    }
  }
  return found;
}

export function describeLocaleCodes(locales: readonly string[]): DoctorFinding {
  const found = nonCanonicalLocales(locales);
  if (found.length === 0) {
    return passing("Every configured locale code is in canonical BCP 47 form.");
  }
  const suggestions = found
    .map(({ locale, canonical }) => `"${locale}" is canonically "${canonical}"`)
    .join(", ");
  return warning(
    `${suggestions}. Consider the canonical form in your config; file names follow the ` +
      "configured code and are never renamed for you.",
  );
}
