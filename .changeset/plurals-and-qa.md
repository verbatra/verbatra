---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

CLDR plurals, ICU arm checks, other-syntax placeholder and direction control warnings, `check --qa`.

**Plurals and ICU arms**
- Plural categories come from CLDR through `Intl.PluralRules` for every language, and i18next
  ordinals follow ordinal rules. `generatePlurals` creates the forms a language needs.
- `check` lists plurals missing a category in `incompletePlurals`, as a warning. `doctor` gains
  the `plural-rules` and `plural-completeness` checks.
- For next-intl and ARB, LLM providers receive the target's plural categories, and the integrity
  gate refuses `plural`, `selectordinal` or `select` arms that do not fit.
- `keyIntegrity`, exports and imports report wrong arms (`icuArmsMatch`, `icu-arms`).
- `extract` counts a key held only as plural forms as present: `t("cart.items", { count })` no
  longer adds an empty `cart.items` next to `cart.items_one` and `cart.items_other`, and the same
  holds for gettext `msgid_plural` entries and Android `<plurals>`.
- `tmx import` fills plural forms: a unit whose text matches a plural form in the source file is
  stored for it, so `cart.items_one` and `cart.items_other` are served from the imported memory.
- `verbatra types` declares the base key i18next looks up for a plural group, so
  `t("cart.items", { count })` type-checks: `cart.items` requires `count` and every argument its
  forms take, and `place_ordinal_one` declares `place`.

**Integrity gate**
- Each locale carries `integrityRefusals` with the reason and details per withheld key.
- Placeholder names in any script (`{número}`, `{名前}`) are protected in vue-i18n, properties
  and INI, and resx named holes (`{name}`, `{when:d}`) are protected like `{0}`.
- `LENGTH_RATIO_OUTLIER` counts graphemes weighted by script, so correct Chinese, Japanese or
  Korean is no longer flagged.

**Placeholders of another syntax**
- A translation that drops or changes a token shaped like a placeholder the format does not
  protect, such as `{name}` in an i18next value or `%{count}` in YAML, is flagged
  `FOREIGN_PLACEHOLDER_CHANGED` by translation runs, `retranslateEntry`, exports and `check --qa`.
  The value is still written, and translated ICU arms are never flagged.
- `check --qa` names each missing token in the warning's `details`, as `-{name}`.
- Each locale reports `SOURCE_FOREIGN_PLACEHOLDERS` naming its pending keys that hold such a
  token, on a dry run too, so you can review them or change the syntax before anything is spent.
  Formats from third-party adapters are not checked.

**Direction controls**
- A translation that leaves an embedding, override or isolate unclosed while the source closes
  its own, or adds a left-to-right or right-to-left override, is flagged `BIDI_CONTROLS_CHANGED`
  by translation runs, `retranslateEntry`, exports and `check --qa`. Directional marks such as
  U+200F are never flagged.

**Checking committed translations**
- `verbatra check --qa` runs the integrity and review checks over every committed value, keyless
  and read-only. It exits 1 on an error, and on a warning with `--strict`. `--severity error`
  reports errors only.
- `verbatra check --file <path>` (SDK: `checkFile`) checks one locale file and reports a parse
  failure as a `syntax` finding with line and column. `AdapterError` gains a `position`.
- `localeIntegrity` judges every key of a locale, and `glossaryDraftCheck` checks a draft.
