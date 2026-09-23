---
"@verbatra/mcp": patch
---

Keep `glossary.get` and `glossary.write` working on a version 2 glossary.

Both list each term's translation for every locale, as before; a term with only per-locale
translations or forbidden renderings is not listed yet. `glossary.write` with `translation: null`
now clears only that shared translation and keeps a term that still has per-locale translations
or forbidden renderings; a term with nothing else left is removed, as before.
