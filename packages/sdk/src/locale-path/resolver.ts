import { resolve } from "node:path";
import type { SupportedFormat } from "@verbatra/core";
import { SdkError } from "../errors.js";
import { expandPattern, LOCALE_TOKEN, tokenOccupiesWholeSegments } from "./pattern.js";
import { isSharedCatalogueFormat } from "./shared-catalogue-format.js";
import { isSafeSpelling, isSegmentStyle, type LocaleStyle, spellLocale } from "./style.js";

const DEFAULT_LOCALE_STYLE: LocaleStyle = "literal";

/**
 * The slice of a {@link VerbatraConfig} that determines locale-to-path mapping. It is narrower than
 * the full config on purpose, so a caller holding only these fields can build a resolver.
 */
export interface LocalePathResolverConfig {
  /** The source locale, which some styles spell differently from the targets. */
  readonly sourceLocale: string;
  /** Every target locale. All of them are mapped up front so collisions are caught immediately. */
  readonly targetLocales: readonly string[];
  /**
   * The configured format. Every format maps each locale to a distinct path except a
   * shared-catalogue format (one holding every locale in a single file, such as `apple-xcstrings`),
   * which maps every locale to the same path.
   */
  readonly format: SupportedFormat;
  /** The file layout. */
  readonly files: {
    /** The path pattern, which must contain the `{locale}` token. */
    readonly pattern: string;
    /** How a locale is spelled inside the path. Defaults to `literal`. */
    readonly localeStyle?: LocaleStyle | undefined;
  };
}

/** The two-way mapping between locales and their absolute file paths. */
export interface LocalePathResolver {
  /**
   * The absolute path of a locale's file. Accepts any locale string, including ones outside the
   * configured set, so it can be used for exploratory reads.
   */
  pathFor(locale: string): string;
  /**
   * The configured locale owning an absolute path, or `undefined` when the path belongs to no
   * configured locale. The path is normalized before lookup, so a relative or non-canonical path
   * still resolves.
   *
   * Always `undefined` for a shared-catalogue format: every configured locale resolves to the same
   * path there, so no single locale owns it.
   */
  localeFor(absolutePath: string): string | undefined;
}

function validatePattern(pattern: string, style: LocaleStyle): void {
  if (!pattern.includes(LOCALE_TOKEN)) {
    throw new SdkError(
      "LOCALE_LAYOUT_INVALID",
      `The files pattern "${pattern}" must contain the ${LOCALE_TOKEN} token.`,
    );
  }
  if (isSegmentStyle(style) && !tokenOccupiesWholeSegments(pattern)) {
    throw new SdkError(
      "LOCALE_LAYOUT_INVALID",
      `The "${style}" locale style expands ${LOCALE_TOKEN} to a whole path segment, so the token must stand alone between separators, but the pattern "${pattern}" embeds it in a segment.`,
    );
  }
}

function safeSpelling(locale: string, style: LocaleStyle, sourceLocale: string): string {
  const spelling = spellLocale(locale, style, locale === sourceLocale);
  if (spelling === undefined) {
    throw new SdkError(
      "LOCALE_LAYOUT_INVALID",
      `The "${style}" locale style has no valid path spelling for the locale "${locale}".`,
    );
  }
  if (!isSafeSpelling(spelling)) {
    throw new SdkError(
      "LOCALE_LAYOUT_INVALID",
      `The locale "${locale}" expands to "${spelling}" under the "${style}" locale style, which is not a single path segment.`,
    );
  }
  return spelling;
}

function buildForwardMap(
  config: LocalePathResolverConfig,
  pathFor: (locale: string) => string,
): ReadonlyMap<string, string> {
  const forward = new Map<string, string>();
  for (const locale of [config.sourceLocale, ...config.targetLocales]) {
    const path = pathFor(locale);
    const claimed = forward.get(path);
    if (claimed !== undefined && claimed !== locale) {
      throw new SdkError(
        "LOCALE_PATH_COLLISION",
        `The locales "${claimed}" and "${locale}" both resolve to ${path}.`,
      );
    }
    forward.set(path, locale);
  }
  return forward;
}

function sharedCataloguePathFor(cwd: string, pattern: string): (locale: string) => string {
  const path = resolve(cwd, expandPattern(pattern, ""));
  return () => path;
}

/**
 * Builds the project's locale-to-path mapping from the configured pattern, locales, and
 * {@link LocaleStyle}, in both directions.
 *
 * Every SDK flow resolves paths through this, and a consumer that watches or reports on locale
 * files should use it too rather than re-deriving the mapping: a watcher that guesses at paths will
 * disagree with the SDK the moment a non-literal locale style is configured.
 *
 * The whole configured locale set is mapped eagerly during construction, so an unusable layout or a
 * path collision is reported here, before any file is read and before any provider is called,
 * rather than partway through a run.
 *
 * For a shared-catalogue format (such as `apple-xcstrings`), `pathFor` resolves every locale to the
 * same path (the `{locale}` token is still required in the pattern but substitutes to the empty
 * string), no locale style is applied, and `localeFor` always returns `undefined` rather than
 * reporting a collision: every configured locale sharing one path is the expected shape for these
 * formats, not a configuration mistake.
 *
 * @param cwd - Directory the pattern is resolved against.
 * @param config - The source locale, target locales, format, and file layout.
 * @returns A resolver mapping locales to paths and paths back to locales.
 *
 * @throws {@link SdkError} `LOCALE_LAYOUT_INVALID`: the pattern lacks the `{locale}` token, a
 * segment style's token does not stand alone between separators, or a configured locale has no
 * valid single-segment spelling under the declared style.
 * @throws {@link SdkError} `LOCALE_PATH_COLLISION`: two configured locales resolve to the same
 * absolute path, for a format that is not a shared-catalogue format.
 */
export function createLocalePathResolver(
  cwd: string,
  config: LocalePathResolverConfig,
): LocalePathResolver {
  const style = config.files.localeStyle ?? DEFAULT_LOCALE_STYLE;
  const pattern = config.files.pattern;
  validatePattern(pattern, style);

  if (isSharedCatalogueFormat(config.format)) {
    return { pathFor: sharedCataloguePathFor(cwd, pattern), localeFor: () => undefined };
  }

  const pathFor = (locale: string): string =>
    resolve(cwd, expandPattern(pattern, safeSpelling(locale, style, config.sourceLocale)));

  const forward = buildForwardMap(config, pathFor);
  return {
    pathFor,
    localeFor: (absolutePath: string): string | undefined =>
      forward.get(resolve(cwd, absolutePath)),
  };
}
