---
"@verbatra/sdk": minor
---

Replace text across the values of your target locales with `previewValueReplace` and `applyValueReplace`.

- **What you get:** `previewValueReplace` lists the values that contain a literal `find` text, up to 1,000, with a status each (`ready`, `stale-source`, `gate-refused`, `pinned`, `protected`, `no-source-entry`, `unchanged`, `too-long`) and the hash of the current value, and sets `baselineUnavailable` when the lock file could not be read. `applyValueReplace` changes the values you pick and answers `applied`, `skipped`, `refused`, `changed` or `too-long` for every one. Matching is literal and case sensitive by default and never splits a surrogate pair; the replacement is inserted as written, so `$&` has no special meaning.
- **Checked again when you apply:** the new value is recomputed from the text on disk under the locale's write lock and held to the integrity gate, so a value that changed after the preview comes back `changed` and nothing is written for it. When a `locale` and `key` repeat in `entries`, the first one decides and the rest are `skipped` as `duplicate-entry`.
- **ICU formats:** for next-intl and ARB, a replacement that changes an argument's name or type, a number or date style or skeleton, or the number of `#` in a plural arm is refused with the reason `icu`.
- **A failing locale:** a locale that cannot be finished (its lock stays taken, its file is unwritable or malformed) no longer stops the others. It is listed in `localeFailures` and its entries come back `skipped` as `locale-failed`.
- **What is left alone:** keys matching `pinnedKeys` and values a person wrote, imported or changed outside verbatra are skipped unless you pass `includePinned` or `includeProtected`, whatever `humanEdits` says; an agent never changes a pinned key. A provenance file from a newer verbatra counts every value as protected and is never rewritten.
- **What gets recorded:** every written value gets a new provenance record with the `actor` you pass as its origin and no review decision. A key whose source text changed since its translation was recorded keeps its old lock-file hash, so `check` still reports it out of date, and its value is not added to the translation memory.
- **New error code:** `FIND_TEXT_INVALID` for an empty `find`, one over 20,000 characters, or a `find` or `replace` with an unpaired surrogate.
- **Docs:** `editEntry` moved to the new SDK page "Edit" beside the two new functions, and the old page is now "Review and retranslate"; the `editEntry` anchor still resolves from the old SDK page.
