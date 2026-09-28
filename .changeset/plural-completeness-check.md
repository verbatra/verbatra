---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Report plurals that lack CLDR plural categories the target language needs, in `check` and `doctor`, for every format whose plural forms follow CLDR categories.

Previously only an i18next translation run noticed a missing plural category, so `verbatra check` reported a Polish Android `<plurals>` with only `one` and `other` as in sync.

Now every `check` lists, per locale in `incompletePlurals`, each plural whose committed forms lack categories the target language uses, with the stable code `PLURAL_CATEGORIES_INCOMPLETE` (the code a translation run already reports for the same condition), the key, the ICU argument where there is one, the rule type and the missing categories. It covers `i18next-json` (including `_ordinal` plurals), `android-xml`, `apple-strings` (`.stringsdict`), `apple-xcstrings`, and the ICU `plural` and `selectordinal` messages of `next-intl-json` and `arb`. `other` is always required, an exact-value arm such as `=1` never stands in for a category, and a category the language does not use is not reported. It is a warning: a plain `check` keeps its exit code, and `check --qa --strict` exits 1 on it as on every other warning. `doctor` gains an informational `plural-completeness` check that names the same plurals and never fails.
