---
"@verbatra/studio": patch
---

Guard `translation.retranslateEntry` and `translation.editEntry` against an accidental concurrent duplicate call for the same locale and key, extending the existing in-flight guard (previously only wired to `translation.translatePending`) with per-`(locale, key)` granularity. A second overlapping call for the same key is rejected with `ALREADY_IN_PROGRESS` before it reaches the provider, so a UI double-click or a scripted retry can no longer bill the configured provider twice for one logical request. A concurrent call for a different key is unaffected.
