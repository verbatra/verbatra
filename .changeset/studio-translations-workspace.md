---
"@verbatra/studio": minor
---

Translations is one key table with working filters for every key state.

- **One table:** every key that needs attention is a row: missing, changed, orphaned, protected, in the review queue or failing an integrity check. Without a locale chosen, each row shows the key, its source text and one status per locale. Pick a locale and the columns become translation, status and origin.
- **Grid and List:** the switch is gone; the table switches columns when you pick a locale.
- **Filters:** the state chips and the locale choice work in both views, and a chip that cannot load names the reason on focus instead of going dead.
- **Search:** searching finds any key by name, source text or translation, including keys that are already in sync. When more than 500 keys match, the table says how many it shows.
- **Keyboard:** the arrow keys move between cells in the table, and Enter or Space opens the key.
- **Editing beside the table:** from 1280px wide, a key opens in an editor next to the table; on narrower screens it opens in a drawer, and the translation form is part of it instead of a second dialog. Leaving a key with unsaved edits, by choosing another key, a filter, a search, a page or Back, asks whether to save, discard or keep editing; leaving Studio itself gets the browser's own confirmation.
- **Review editor:** after an edit saved from a Review row, focus moves to the next row instead of the page, and a failed read of the key's context offers a Retry.
