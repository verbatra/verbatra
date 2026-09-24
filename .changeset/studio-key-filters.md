---
"@verbatra/studio": minor
---

Filter the Translations list by state and locale, including review queue entries and integrity problems.

Previously the List view could only match a key's name or text. It now also narrows to one
locale and to any combination of **Missing**, **Changed**, **Orphaned**, **Needs review**,
**Review queue**, and **Integrity problems**, each toggle showing its count, and lists the review
queue and failing integrity checks as their own groups. The new read-only `locale.integrity`
method reports the integrity verdict of every changed key in one call, and is registered as the
agent tool `verbatra_locale_integrity`.
