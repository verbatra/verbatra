---
"@verbatra/sdk": minor
---

Derive each target language's plural categories from CLDR through `Intl.PluralRules`.

Previously a built-in table covered nine languages (ar, cy, ga, pl, ru, uk, be, lt, sl) and every
other language was assumed to need `one` and `other`. Czech, Slovak, Hebrew, Romanian, Maltese,
French, Spanish, Italian, Portuguese and the rest were never flagged or generated, and Japanese,
Chinese, Korean, Thai and Vietnamese were told they need `one`.

Now the categories come from the CLDR data in the running Node.js ICU, for every language it knows,
always in CLDR order. `PLURAL_CATEGORIES_INCOMPLETE` and `generatePlurals` use that set, so a
French target now needs `many`. The nine previously covered languages resolve exactly as before. A
locale ICU has no plural rules for keeps the old `one` and `other` assumption and gets no generated
forms. `doctor` gains an informational `plural-rules` check naming the ICU and CLDR versions and any
target locale without plural rules.
