---
"@verbatra/studio": minor
---

Edit a per-locale glossary from the Settings page.

The glossary panel now has a locale selector. Under "All locales" each term shows its translation
for every locale plus the locales with their own. Choosing a locale shows the translation that
locale uses, marked when it is inherited, and the renderings it must never use. The editor sets a
translation for all locales or for the chosen one, that locale's forbidden renderings, a note, a
part of speech and case sensitivity, and a new "Do not translate" list keeps brand names
untranslated in every locale. The `glossary.get` and `glossary.write` agent tools carry the same
data and parameters. A glossary term named `__proto__`, `constructor` or `prototype` is no longer
dropped from the panel.
