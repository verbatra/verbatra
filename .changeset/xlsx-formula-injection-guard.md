---
"@verbatra/sdk": patch
---

Extend the existing CSV/TSV formula-injection guard to the xlsx export path. Source, current-translation, translation, and context values that begin with a formula-triggering character are now apostrophe-escaped before being written to the workbook, and unescaped again on import, so a translatable string can no longer become a live formula when a reviewer opens the exported spreadsheet.
