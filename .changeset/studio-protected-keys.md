---
"@verbatra/studio": minor
---

Show protected keys as needing review, and let a person replace one deliberately.

Previously the Translations page showed a stale key a person wrote like any other changed key, and
a retranslate from the key drawer replaced it. Now the key grid marks such a key, and a pinned key,
as `Protected`, the per-locale lists give them their own group with a count, and a retranslate
that verbatra refuses with `KEY_PROTECTED` offers `Replace anyway`, which retries with the new
`includeHuman` parameter of `translation.retranslateEntry`. The WebMCP retranslate tool never
sends it, so an agent cannot replace a person's work, and its descriptions name the
`KEY_PROTECTED` and `KEY_PINNED` refusals.
