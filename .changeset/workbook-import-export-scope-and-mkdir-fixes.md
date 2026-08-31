---
"@verbatra/sdk": patch
---

Fix `importWorkbook` reporting a spurious missing-sheet failure for every configured target locale not covered by a single-file delimited import, when it should only check the one locale that single file targets; directory-mode delimited imports and xlsx imports still check every configured target locale as before. Fix `exportWorkbook` failing to create a not-yet-existing nested output directory for an `.xlsx` handoff, by creating it first the same way the delimited export branch already does. Also correct `exportWorkbook`'s `@throws` JSDoc, which no longer holds true now that a missing output directory is created automatically.
