# 1. Script subtags under the posix locale style

- Status: accepted
- Date: 2026-09-28
- Applies to: `@verbatra/sdk`

## Context

Config locales are BCP 47 codes (`packages/sdk/src/config/locale-code.ts`), and
`files.localeStyle` only decides how a code is spelled on disk
(`packages/sdk/src/locale-path/style.ts`). The `posix` style replaces `-` with `_`, and a script
subtag was joined the same way: `sr-Latn` became `sr_Latn` and `zh-Hant-TW` became `zh_Hant_TW`.

That ICU spelling is what Java resource bundles (`messages_sr_Latn.properties`) and Flutter ARB
files (`app_zh_Hant_TW.arb`) use, and `init` defaults both formats to `posix`. gettext and glibc
name locales differently, as `language_TERRITORY@modifier`: Serbian Latin is `sr@latin` or
`sr_RS@latin`, Uzbek Cyrillic `uz@cyrillic`, and Traditional Chinese in Taiwan is `zh_TW`, with the
script implied by the territory. A gettext project could therefore not serve those locales from
the directories its other tools read.

## Decisions

### 1. The script convention follows the format, not a new locale style

Under `posix`, the `gettext-po` format uses the gettext convention and every other format keeps the
ICU one (`scriptConventionOf` in `packages/sdk/src/locale-path/posix.ts`). A separate style would
make every gettext user opt in to the only spelling their toolchain understands, and switching
`posix` itself to the gettext convention would break the Java and Flutter layouts it already
serves. The two conventions agree on everything but scripts: `pt-BR` is `pt_BR` and `es-419` is
`es_419` in both.

### 2. A script implied by the language and region is left out

`zh-Hant-TW` is written `zh_TW`, not `zh_Hant_TW`, and `sr-Cyrl-RS` is written `sr_RS`. This
matches glibc (`zh_TW`, `zh_HK`, `sr_RS`, `uz_UZ`) and gettext practice. Whether a script is
implied comes from CLDR likely subtags through `Intl.Locale.prototype.maximize`, not a hand-kept
table. `zh_Hant_TW` was rejected because no gettext tool reads it.

The cost is that `zh-TW` and `zh-Hant-TW` name the same file. Configuring both is reported as
`LOCALE_PATH_COLLISION` when the resolver is built, and reading `zh_TW` back from disk (layout
detection) yields `zh-TW`, the shortest code for that file. A path maps back to the configured
code through the resolver's forward map, so a project configured with `zh-Hant-TW` still resolves
`zh_TW` to `zh-Hant-TW`.

### 3. Three script modifiers, and nothing else

`Latn`, `Cyrl`, and `Deva` map to `@latin`, `@cyrillic`, and `@devanagari`, the script modifiers
glibc ships (`sr_RS@latin`, `be_BY@latin`, `uz_UZ@cyrillic`, `ks_IN@devanagari`,
`sd_IN@devanagari`). The modifier follows the territory. Modifiers that name a variant or an
orthography rather than a script (`@valencia`, `@iqtelif`) are out of scope.

A script that is neither implied nor in the table, such as `zh-Hant` without a region, is refused
with `LOCALE_LAYOUT_INVALID`; the message names the locale and the supported modifiers. A variant
is refused under both conventions, as before.

### 4. Reading back and migration

Layout detection (`packages/sdk/src/detection/locale-spelling.ts`) reads `sr@latin` and
`sr_RS@latin` as `sr-Latn` and `sr-Latn-RS`, alongside the underscore spellings it already read. A
config code written the gettext way is still not BCP 47; its validation message suggests the
hyphenated code with the `posix` style, and lock-file, translation-memory, and provenance state
recorded under it is carried over to that code like an underscore spelling
(`packages/sdk/src/flow/locale-carry-over.ts`).

## Consequences

- A gettext project can configure `sr-Latn`, `uz-Cyrl`, `zh-Hant-TW`, or `es-419` and keep its
  existing `sr@latin`, `uz@cyrillic`, `zh_TW`, and `es_419` directories.
- `posix` now depends on the format for script subtags only. The `LocaleStyle` and
  `LocalePathResolverConfig.format` JSDoc and the `config-file` docs page state this.
- The `Language` header the gettext adapter synthesizes for a new catalogue still uses the ICU
  spelling (`sr_Latn`); the file path is correct, and the header is metadata only.
