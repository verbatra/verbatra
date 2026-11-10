---
"@verbatra/sdk": minor
---

Replace text across the values of your target locales with `previewValueReplace` and `applyValueReplace`.

- **What you get:** `previewValueReplace` lists up to 1,000 values that contain a literal `find` text (`truncated` says when there were more), and `applyValueReplace` changes the values you pick and reports the outcome of each. Matching is literal and the replacement is inserted as written.
- **Safe:** each new value is rechecked when you apply and held to the integrity gate, so a value that changed after the preview is not written.
- **What is left alone:** keys matching `pinnedKeys` and values a person wrote, imported or changed outside verbatra are skipped unless you pass `includeProtected`, or `includePinned` with `actor` set to `human`; an agent never changes a pinned key.
