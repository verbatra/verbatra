---
"@verbatra/studio": minor
---

Filter the Translations list by state and locale, including review queue entries and integrity
problems.

Previously the List view could only match a key's name or text. It now also narrows to one
locale and to any combination of **Missing**, **Changed**, **Orphaned**, **Protected**,
**Review queue**, and **Integrity problems**, each toggle showing how many keys the search leaves
in it, lists the review queue and failing integrity checks as their own groups, and shows an empty
state when the search matches nothing. **Integrity problems** judges every translated key, changed
or in sync, so a broken placeholder, markup, or plural arm in a key that is in sync is found. The
new read-only `locale.integrity` method returns the failing keys of every locale in one call, and
is registered as the agent tool `verbatra_locale_integrity`. When nothing is pending but a
translation fails a check, the key explorer stays in its List view so the filter can reach it, and
the key detail view and editor show that defect even where the key is in sync, with **Edit** and,
when spending is allowed, **Retranslate**.
