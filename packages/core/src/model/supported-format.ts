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
] as const;

/**
 * Zod schema accepting exactly one of the thirteen source formats verbatra can read and write. Each
 * member names the ecosystem it round-trips, not just a file extension, because several of them share
 * one: `i18next-json` is i18next's nested JSON with its plural key suffixes, `vue-i18n-json` is Vue
 * I18n's JSON with its pipe-separated plural values, `next-intl-json` is next-intl's ICU-message JSON,
 * and `ngx-translate-json` is ngx-translate's nested JSON. The remaining nine are `xliff` (the XLIFF
 * interchange XML), `yaml` (plain nested YAML), `arb` (Flutter's Application Resource Bundle),
 * `properties` (Java and Spring `.properties` files), `apple-strings` (Apple's flat `.strings`
 * localization format for iOS and macOS), `apple-xcstrings` (Apple's Xcode String Catalog, a single
 * JSON document holding every locale of a `.xcstrings` catalogue together), `android-xml` (Android's
 * `res/values/strings.xml` resource format, including `<plurals>` and `translatable="false"` entries),
 * `gettext-po` (GNU gettext's `.po` and `.pot` catalogs, including `msgctxt` disambiguation and
 * `msgid_plural`/`msgstr[n]` plural forms keyed by the file's own `Plural-Forms` index count), and
 * `ini` (classic INI configuration files, one level of `[section]` headers over `key=value` lines,
 * whose entries are addressed as `section.key`).
 *
 * The set is closed: a format outside it cannot be represented, so adding one means adding a member
 * here and an adapter that claims it.
 */
export const supportedFormatSchema = z.enum(SUPPORTED_FORMATS);

/** One of the thirteen supported source formats; the inferred type of {@link supportedFormatSchema}. */
export type SupportedFormat = z.infer<typeof supportedFormatSchema>;
