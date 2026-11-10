---
"@verbatra/studio": patch
---

Link straight to a locale, status filter or key (`#/translations?locale=de&status=missing&key=...`).

- **Deep links:** `#/translations` takes `locale`, `status` and `key`, and `#/review` takes `locale`.
- **Shareable state:** changing a filter or opening a key updates the address in place, without adding history entries.
