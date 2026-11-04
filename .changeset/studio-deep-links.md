---
"@verbatra/studio": patch
---

Link straight to a locale, status filter or key (`#/translations?locale=de&status=missing&key=...`).

- **Deep links:** `#/translations` takes `locale`, `status` (repeat it for several) and `key`, and opens the filtered list with the key's details. `#/review` takes `locale`. Unknown values are ignored.
- **Shareable state:** changing a filter or opening a key updates the address in place, without adding browser history entries, so you can copy the address from the bar.
- **Pages:** the navigation now lists Overview, Translations and Review, then Glossary and Settings. Overview shows the former Activity page, and `#/activity` links keep working.
