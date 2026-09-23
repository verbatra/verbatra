---
"@verbatra/studio": patch
---

Keep the Settings glossary editor working on a version 2 glossary.

It lists each term's translation for every locale, as before; a term with only per-locale
translations or forbidden renderings is not listed yet. Removing a term clears only that shared
translation and keeps a term that still has per-locale translations or forbidden renderings. The
review page labels the new `GLOSSARY_FORBIDDEN_TERM` reason "Forbidden term used".
