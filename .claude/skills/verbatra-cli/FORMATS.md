# Supported formats

## Formats

`format` in the config is one of these fourteen. The built-in set is closed; the
only other accepted value is a `custom:` identifier such as `custom:toml`, naming an
adapter shipped outside verbatra. The CLI loads no plugin, so a `custom:` format
only runs through `@verbatra/sdk`, where the project's own code registers the
adapter.

| Format id | What it claims | `init` default path |
| --- | --- | --- |
| `i18next-json` | i18next nested JSON, including its plural key suffixes | `locales/{locale}.json` |
| `vue-i18n-json` | Vue I18n JSON, including its pipe-separated plural values | `src/locales/{locale}.json` |
| `next-intl-json` | next-intl ICU-message JSON | `messages/{locale}.json` |
| `ngx-translate-json` | ngx-translate nested JSON | `src/assets/i18n/{locale}.json` |
| `xliff` | XLIFF interchange XML; target files must already exist | `locales/{locale}.xlf` |
| `yaml` | Plain nested YAML | `locales/{locale}.yml` |
| `arb` | Flutter Application Resource Bundle | `lib/l10n/app_{locale}.arb`, `posix` style |
| `properties` | Java and Spring `.properties` | `src/main/resources/messages_{locale}.properties`, `posix` style |
| `apple-strings` | Apple flat `.strings` for iOS and macOS | `{locale}.lproj/Localizable.strings` |
| `apple-xcstrings` | Xcode String Catalog; every locale lives in one file | `{locale}Localizable.xcstrings` |
| `android-xml` | Android `res/values*/strings.xml`; set `files.localeStyle` to `android` | `app/src/main/res/{locale}/strings.xml`, `android` style |
| `gettext-po` | GNU gettext `.po` and `.pot`, including `msgctxt` and plural forms | `locales/{locale}/LC_MESSAGES/messages.po`, `posix` style |
| `ini` | Classic INI; a key under `[section]` is addressed as `section.key` | `locales/{locale}.ini` |
| `resx` | .NET XML resources; typed and designer entries are preserved untouched | `Resources/Strings.{locale}.resx` |

Under the `posix` style, `gettext-po` spells a locale the gettext way: a script
the region implies is dropped (`zh-Hant-TW` is `zh_TW`), and `Latn`, `Cyrl` and
`Deva` become `@latin`, `@cyrillic` and `@devanagari` (`sr-Latn-RS` is
`sr_RS@latin`). Configure the BCP 47 code (`sr-Latn`), never `sr@latin`; every
other format keeps `sr_Latn`.

Plain JSON with no matching library: pick by placeholder syntax. `{{name}}` means
`i18next-json`, single-brace `{name}` means `vue-i18n-json`.
