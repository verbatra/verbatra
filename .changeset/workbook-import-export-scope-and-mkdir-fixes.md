---
"@verbatra/sdk": patch
---

Fix `importWorkbook` reporting a spurious missing-sheet failure for target
locales not covered by a single-file delimited import; it now only checks the
one locale that file targets. Fix `exportWorkbook` failing to create a
not-yet-existing nested output directory for an `.xlsx` handoff, matching the
delimited export branch's existing behavior.
