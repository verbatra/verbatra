import { z } from "zod";

export const SUPPORTED_FORMATS = [
  "i18next-json",
  "vue-i18n-json",
  "next-intl-json",
  "ngx-translate-json",
  "xliff",
  "yaml",
  "arb",
  "properties",
  "apple-strings",
  "apple-xcstrings",
  "android-xml",
  "gettext-po",
  "ini",
  "resx",
] as const;

/**
 * Zod schema accepting exactly one of the fourteen source formats verbatra can read and write. Each
 * member names the ecosystem it round-trips, not just a file extension, because several of them share
 * one: `i18next-json` is i18next's nested JSON with its plural key suffixes, `vue-i18n-json` is Vue
 * I18n's JSON with its pipe-separated plural values, `next-intl-json` is next-intl's ICU-message JSON,
 * and `ngx-translate-json` is ngx-translate's nested JSON. The remaining ten are `xliff` (the XLIFF
 * interchange XML), `yaml` (plain nested YAML), `arb` (Flutter's Application Resource Bundle),
 * `properties` (Java and Spring `.properties` files), `apple-strings` (Apple's flat `.strings`
 * localization format for iOS and macOS), `apple-xcstrings` (Apple's Xcode String Catalog, a single
 * JSON document holding every locale of a `.xcstrings` catalogue together), `android-xml` (Android's
 * `res/values/strings.xml` resource format, including `<plurals>` and `translatable="false"` entries),
 * `gettext-po` (GNU gettext's `.po` and `.pot` catalogs, including `msgctxt` disambiguation and
 * `msgid_plural`/`msgstr[n]` plural forms keyed by the file's own `Plural-Forms` index count),
 * `ini` (classic INI configuration files, one level of `[section]` headers over `key=value` lines,
 * whose entries are addressed as `section.key`), and `resx` (.NET's XML resource format; its `<data>`
 * elements carrying a `type` or `mimetype` attribute, and its designer metadata names, are preserved
 * untouched rather than translated).
 *
 * The set is closed: adding a built-in format means adding a member here and an adapter that claims
 * it. A format shipped by a package outside verbatra is named by a `custom:` identifier instead and
 * never joins this set; see `FormatId`.
 */
export const supportedFormatSchema = z.enum(SUPPORTED_FORMATS);

/** One of the fourteen supported source formats; the inferred type of {@link supportedFormatSchema}. */
export type SupportedFormat = z.infer<typeof supportedFormatSchema>;
