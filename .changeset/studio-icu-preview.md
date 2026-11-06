---
"@verbatra/studio": minor
---

Preview an ICU message in the translation editor.

- **Where:** a collapsed **ICU preview** sits under the draft in the Translations editor and in the Review edit dialog, for projects that use `next-intl-json` or `arb`. It stays closed until you open it; Studio remembers the choice, and your sample values, for the session.
- **What you see:** one row per arm of your current draft: each plural category, exact arm and select option, in the locale's own language and direction. Rows for a nested argument are grouped under the outer arm they sit in. At most 24 rows show, and Studio says when rows were left out.
- **Sample values:** type a value for any argument. Numbers are read as numbers (a decimal comma works), a date takes `2024-03-15` or milliseconds, a comma before exactly three digits is flagged as ambiguous, and text that does not fit is flagged and left unset. A value for a plural, ordinal or select argument adds a row showing it, first in the list so you see it where you typed.
- **While you type:** a draft that is not valid ICU, too long or too complex says so and keeps the last good rows, dimmed, under the reason. A failed read shows an error with Retry and never changes your draft.
- **Runtime data:** numbers and dates use this computer's language data, so the text can differ from your application's runtime.
