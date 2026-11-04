---
"@verbatra/studio": minor
---

Translations is one key table with working filters for every key state.

- **One table:** every key that needs attention is a row: missing, changed, orphaned, protected, in the review queue or failing an integrity check. Without a locale chosen, each row shows the key, its source text and one status per locale. Pick a locale and the columns become translation, status and origin.
- **Grid and List:** the switch is gone; the table switches columns when you pick a locale.
- **Filters:** the state chips and the locale choice work in both views, and a chip that cannot load names the reason on focus instead of going dead.
- **Search:** searching finds any key by name, source text or translation, including keys that are already in sync. When more than 500 keys match, the table says how many it shows.
- **Keyboard:** the arrow keys move between cells in the table, and Enter or Space opens the key.
