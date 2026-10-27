---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

BCP 47 locale codes, CLDR plurals, ICU arm and placeholder checks, `check --qa`, and `pseudo --mode bidi`.

**Locales**
- Locale codes must be BCP 47, and an invalid one fails `CONFIG_INVALID` with a suggested spelling. The `posix` style spells scripts and numeric regions (`zh_Hant_TW`), `gettext-po` uses gettext names (`sr@latin`), and a respelling carries state over.
- DeepL and Google refuse a locale outside their language table before anything is spent. `provider.options.localeMap` sets the code a provider receives, and `doctor --locales` reports support.

**Plurals and ICU**
- Plural categories come from CLDR. `generatePlurals` creates missing forms, and `check` and `doctor` report incomplete plurals as warnings.
- For next-intl and ARB the integrity gate refuses `plural`, `selectordinal` or `select` arms that do not fit.
- Placeholder names in any script are protected, and resx `{name}` holes count as placeholders.

**QA checks**
- A dropped or changed token shaped like a placeholder the format does not interpolate (`{name}` in i18next) is flagged `FOREIGN_PLACEHOLDER_CHANGED`, and an unclosed or added direction override `BIDI_CONTROLS_CHANGED`.
- `verbatra check --qa` runs the integrity and review checks over every committed value, keyless. `check --file <path>` checks one file and reports a parse failure with line and column.
- `verbatra pseudo --mode bidi` writes a right-to-left pseudolocale, `ar-XB` by default.
