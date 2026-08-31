---
"@verbatra/studio": patch
---

Fix the Translations panel's status grid rendering every drift key uncapped, unlike the list view, which already caps at 500 and shows a truncation notice. The grid is the panel's default view, so a project with thousands of pending keys previously had to build every row and cell before painting anything. The grid now reuses the list view's existing `filterAndCapKeys` cap and shows "Showing the first 500 of N keys. Switch to the List view to filter." when truncated.
