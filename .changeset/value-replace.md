---
"@verbatra/sdk": minor
---

Replace text across the values of your target locales with `previewValueReplace` and `applyValueReplace`.

- **What you get:** `previewValueReplace` lists the values that contain a literal `find` text, up to 1,000, with a status each (`ready`, `stale-source`, `gate-refused`, `pinned`, `protected`, `no-source-entry`, `unchanged`) and the hash of the current value. `applyValueReplace` changes the values you pick and answers `applied`, `skipped`, `refused` or `changed` for every one. Matching is literal and case sensitive by default; the replacement is inserted as written, so `$&` has no special meaning.
- **Checked again when you apply:** the new value is recomputed from the text on disk under the locale's write lock and held to the integrity gate, so a value that changed after the preview comes back `changed` and nothing is written for it.
- **What is left alone:** keys matching `pinnedKeys` and values a person wrote, imported or changed outside verbatra are skipped unless you pass `includePinned` or `includeProtected`, whatever `humanEdits` says; an agent never changes a pinned key.
- **What gets recorded:** every written value gets a new provenance record with the `actor` you pass as its origin and no review decision. A key whose source text changed since its translation was recorded keeps its old lock-file hash, so `check` still reports it out of date, and its value is not added to the translation memory.
- **New error code:** `FIND_TEXT_INVALID` for an empty `find` or one over 20,000 characters.
- **Docs:** `editEntry` moved to the new SDK page "Edit" beside the two new functions; its anchor still resolves from the old SDK page.
