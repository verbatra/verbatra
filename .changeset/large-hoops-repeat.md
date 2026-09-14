---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add per-key maximum length budgets for translated values.

A new optional `maxLength` config key maps a translation key to the longest translated value that
key may hold, so a string with a layout constraint (a nav label, a button, a table header) is
measured on every run. A key absent from the map has no budget and is never measured, so the check
costs nothing for a project that configures none.

Length is counted in grapheme clusters: the characters a reader perceives, rather than UTF-16 code
units or Unicode code points. An emoji assembled from several code points counts as one, and so
does a letter followed by a combining accent. The value is measured exactly as written, leading and
trailing whitespace included, and the comparison is inclusive, so a value of exactly the budget is
not flagged.

Going over budget is advisory, not blocking. It surfaces as a new `MAX_LENGTH_EXCEEDED` review
reason on the run summary's `needsReview` list, in the workbook's review columns, and through the
retranslate flow; the value itself is still written to the locale file and still recorded in the
lock file, because a correct translation that overruns a layout budget is more useful than no
translation. The reason never enters `integrityMismatches`, which stays reserved for output the
integrity gate refuses to write.

The budget is read from the config map and nowhere else: it is never derived from an entry's
description or from a format's own length metadata, and a misspelled top-level key is rejected at
config load rather than silently ignored. A value served from the translation-memory cache, and a
value fanned out to a key that shares its source text, are held to their own key's budget rather
than the budget of the key that was translated.
