---
"@verbatra/studio": patch
---

Fix the Translations panel's status grid rendering every drift key uncapped,
unlike the list view. The grid now caps at 500 keys, matching the list view, and
shows a truncation notice when there are more.
