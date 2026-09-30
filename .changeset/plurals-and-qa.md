---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

CLDR plural rules for every language, ICU arm checks in the integrity gate and in reports, and
`check --qa` and `check --file` for committed translations.

**Plurals and ICU arms**
- Plural categories come from CLDR through `Intl.PluralRules` for every language, and i18next
  ordinals follow ordinal rules. `generatePlurals` creates the forms a language needs.
- `check` lists plurals missing a category in `incompletePlurals`, as a warning. `doctor` gains
  the `plural-rules` and `plural-completeness` checks.
- For next-intl and ARB, LLM providers receive the target's plural categories, and the integrity
  gate refuses `plural`, `selectordinal` or `select` arms that do not fit.
- `keyIntegrity`, exports and imports report wrong arms (`icuArmsMatch`, `icu-arms`).

**Integrity gate**
- Each locale carries `integrityRefusals` with the reason and details per withheld key.
- `LENGTH_RATIO_OUTLIER` counts graphemes weighted by script, so correct Chinese, Japanese or
  Korean is no longer flagged.

**Checking committed translations**
- `verbatra check --qa` runs the integrity and review checks over every committed value, keyless
  and read-only. It exits 1 on an error, and on a warning with `--strict`.
- `verbatra check --file <path>` (SDK: `checkFile`) checks one locale file and reports a parse
  failure as a `syntax` finding with line and column. `AdapterError` gains a `position`.
- `localeIntegrity` judges every key of a locale, and `glossaryDraftCheck` checks a draft.
