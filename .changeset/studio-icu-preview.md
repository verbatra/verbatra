---
"@verbatra/studio": minor
---

Preview an ICU message in the translation editor.

- **Where:** a collapsed **ICU preview** section sits under the draft in the Translations editor and in the Review edit dialog. It appears for projects that use `next-intl-json` or `arb`, and it stays closed until you open it; Studio remembers the choice for the session.
- **What you see:** one row per plural category, exact arm and select option of your current draft, each place an arm appears included, in the locale's own language and direction. Rows left out by the 24-row limit are reported.
- **Sample values:** type a value for any argument; numbers are read as numbers, and text that is not a number is flagged and left unset.
- **Failures:** a message that is not valid ICU, too long or too complex says so. A failed read shows an error with Retry and never changes your draft.
- **Runtime data:** numbers and dates use this machine's Node CLDR data, so the text can differ from your application's runtime.
