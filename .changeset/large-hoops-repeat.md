---
"@verbatra/sdk": minor
"@verbatra/cli": minor
---

Add per-key maximum length budgets for translated values.

A new optional `maxLength` config key maps a translation key to the longest translated value that
key may hold, for a string under a layout constraint: a nav label, a button, a table header. A key
absent from the map has no budget and is never measured, so the check costs nothing for a project
that configures none.

A budget is checked whenever `translate` produces a value for that key: a fresh translation, a
value reused from the cache, and a value fanned out to a key that shares its source text. A key
already translated and still in step with its source is not retranslated and so is not measured,
which means adding budgets to a finished project flags nothing until those keys next change.
`export --include-unchanged` recomputes its review columns for every row it writes, so it is how
you sweep a catalog that is already translated.

`REVIEW_REASON_CODES`, the tuple every reason code is drawn from, is now exported too, so a
consumer can build its own validator or exhaustive lookup from it instead of retyping the members.

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
