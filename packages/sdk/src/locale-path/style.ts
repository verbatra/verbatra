import { androidSegment } from "./android.js";
import { parseLocaleTag } from "./tag.js";

/** The locale spellings {@link LocaleStyle} is drawn from, in declaration order. */
export const LOCALE_STYLES = ["literal", "posix", "android"] as const;

/**
 * How a locale is spelled inside a file path, set through the config's `files.localeStyle`.
 *
 * - `literal`: the locale is written into the path exactly as configured, so `pt-BR` yields
 *   `pt-BR`. This is the default and suits the JSON and YAML layouts most web projects use.
 * - `posix`: the POSIX spelling, so `pt-BR` yields `pt_BR`. A script or a numeric region is
 *   joined the same way, in the ICU and Java manner, keeping the configured case: `zh-Hant-TW`
 *   yields `zh_Hant_TW` and `es-419` yields `es_419`. A locale with a variant has no such
 *   spelling. Common for gettext-influenced and Java-influenced layouts.
 * - `android`: the Android resource-qualifier spelling, so `pt-BR` yields `values-pt-rBR` and the
 *   source locale yields the unqualified `values`. This style expands to a whole path segment, so
 *   the `{locale}` token must stand alone between separators in the pattern.
 *
 * A locale that has no valid spelling under the declared style, or that would expand to something
 * other than a single path segment, is rejected with `LOCALE_LAYOUT_INVALID` before any file is
 * read.
 */
export type LocaleStyle = (typeof LOCALE_STYLES)[number];

const SEGMENT_STYLES: ReadonlySet<LocaleStyle> = new Set<LocaleStyle>(["android"]);

const UNSAFE_IN_SEGMENT = /[/\\\0]/;

export function isSegmentStyle(style: LocaleStyle): boolean {
  return SEGMENT_STYLES.has(style);
}

function posixSpelling(locale: string): string | undefined {
  const tag = parseLocaleTag(locale);
  if (tag === undefined || tag.variants.length > 0) {
    return undefined;
  }
  return locale.replaceAll("-", "_");
}

export function spellLocale(
  locale: string,
  style: LocaleStyle,
  isSourceLocale: boolean,
): string | undefined {
  if (style === "android") {
    return androidSegment(locale, isSourceLocale);
  }
  return style === "posix" ? posixSpelling(locale) : locale;
}

export function isSafeSpelling(spelling: string): boolean {
  return (
    spelling.length > 0 &&
    !UNSAFE_IN_SEGMENT.test(spelling) &&
    spelling !== "." &&
    spelling !== ".."
  );
}
